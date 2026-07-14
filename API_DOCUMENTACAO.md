# Documentação de API - Auto Vale Prevenções (aEasy)

**Base URL:** `https://aeasy.autovaleprevencoes.org`  
**Autenticação:** Cookie-based (PHPSESSID)  
**Content-Type (POST):** `application/x-www-form-urlencoded`  
**Resposta Padrão:** `{ "mensagem": "...", "redirect": "...", "aviso": "...", "reload": true/false }`  
**Resposta de Erro:** HTTP 4xx com `{ "mensagem": "..." }`

---

## 1. AUTENTICAÇÃO

### POST `/conta/login`
Efetua login no sistema.


**Parâmetros:**
| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| UsuariosLogin | string | Sim | CPF ou email do usuário |
| UsuariosSenha | string | Sim | Senha do usuário |

**Resposta 200:**
```json
{
  "mensagem": "Login efetuado com sucesso.",
  "redirect": "/",
  "aviso": null
}
```

**Cookies retornados:** `PHPSESSID`, `users`, `permissions`, `config`, `traducoes`, `trocarsenha`

---

### GET `/conta/login`
Exibe página de login.

### GET `/conta/recuperar`
Exibe formulário de recuperação de senha.

### POST `/conta/recuperar`
Envia token de recuperação por email.


**Parâmetros:**
| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| UsuariosLogin | string | Sim | CPF ou email cadastrado |

**Resposta 200:**
```json
{
  "body": { "UsuariosId": "UUID" }
}
```

---

### POST `/conta/alterar-senha-token`
Altera senha com token recebido por email.

**Parâmetros:**
| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| Id | string (UUID) | Sim | ID do usuário |
| Token | string | Sim | Token recebido por email |
| NovaSenha | string | Sim | Nova senha |
| ConfirmarSenha | string | Sim | Confirmação da senha |

### GET `/conta/sair`
Encerra sessão (logout). Redireciona para `/conta/login`.

---

## 2. DASHBOARD

### GET `/dashboard`
Página principal do painel administrativo (renderiza HTML).

### GET `/dashboard/dados`
Retorna dados JSON do dashboard (gráficos, contadores).

### GET `/dashboard/resumo`
Retorna resumo geral em JSON.

### GET `/painel`
Painel alternativo.

---

## 3. ASSOCIADOS

### GET `/associados`
Página do módulo de associados (HTML com DataTable).


**Query Params (filtros):**
| Param | Descrição |
|-------|-----------|
| pesquisa_geral | Termo de busca |
| pesquisa_geral_opt | Tipo de pesquisa |

### GET `/associados/listar`
Lista associados (JSON para DataTable).

### GET `/associados/detalhes/{id}`
Detalhes de um associado específico.

### GET `/associados/historico/{id}`
Histórico de um associado.

### GET `/associados/veiculos/{id}`
Veículos vinculados a um associado.

### GET `/associados/buscar`
Busca associados por critérios.

### GET `/associados/exportar`
Exporta lista de associados (CSV/Excel).

### GET `/associados/buscar-dados-autocomplete`
Autocomplete para Select2.

**Query Params:**
| Param | Descrição |
|-------|-----------|
| termoPesquisa | Texto digitado (mín. 3 caracteres) |

### POST `/associados/cadastrar`
Cadastra novo associado.

**Parâmetros:**
| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| Nome | string | Sim | Nome completo |
| Documento | string | Sim | CPF/CNPJ |
| Email | string | Sim* | Email (*conforme config) |
| DDD | string | Não | DDD do telefone |
| Telefone | string | Não | Número do telefone |
| CEP | string | Não | CEP do endereço |
| Logradouro | string | Não | Rua/Avenida |
| Numero | string | Não | Número |
| Bairro | string | Não | Bairro |
| EstadosId | string (UUID) | Não | ID do estado |
| CidadesId | string (UUID) | Não | ID da cidade |

### POST `/associados/editar/{id}`
Edita dados de um associado.

### POST `/associados/remover/{id}`
Remove um associado.

---

## 4. VENDAS

### GET `/vendas/listar`
Lista vendas (JSON DataTable).


**Query Params (filtros):**
| Param | Descrição |
|-------|-----------|
| pesquisa_geral | Busca por Associado, Placa, Telefone, Documento |
| campo_pesquisa | Campo específico (telefone, placa, documento) |
| ClientesIndividuosContatosDdd | DDD (quando campo=telefone) |
| ClientesIndividuosContatosTelefone | Telefone (quando campo=telefone) |

### GET `/vendas/detalhes/{id}`
Detalhes de uma venda.

### GET `/vendas/historico/{id}`
Histórico da venda.

### GET `/vendas/arquivos/{id}`
Arquivos anexados à venda.

### GET `/vendas/exportar`
Exporta vendas (CSV/Excel).

### GET `/vendas/buscar-dados-autocomplete`
Autocomplete vendas (param: `termoPesquisa`).

### POST `/vendas/cadastrar`
Cadastra nova venda.

**Parâmetros:**
| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| AssociadosId | string (UUID) | Sim | ID do associado |
| PlanosId | string (UUID) | Sim | ID do plano |
| ConsultoresId | string (UUID) | Sim | ID do consultor |
| VeiculosId | string (UUID) | Sim | ID do veículo |
| DataVenda | date | Sim | Data da venda |
| ValorAdesao | decimal | Sim | Valor da adesão |
| ValorMensalidade | decimal | Sim | Valor da mensalidade |

### POST `/vendas/editar/{id}`
Edita uma venda existente.

### POST `/vendas/remover/{id}`
Remove uma venda.

### POST `/vendas/aprovar/{id}`
Aprova uma venda pendente.

### POST `/vendas/reprovar/{id}`
Reprova uma venda pendente.

---

## 5. ADESÕES

### GET `/adesoes`
Módulo de adesões (HTML).

### GET `/adesoes/listar`
Lista adesões (JSON DataTable).

### POST `/adesoes/cadastrar`
Cadastra nova adesão.

**Parâmetros:**
| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| VendasId | string (UUID) | Sim | ID da venda |
| DataAdesao | date | Sim | Data da adesão |
| Valor | decimal | Sim | Valor da adesão |

### POST `/adesoes/editar/{id}`
Edita adesão.

### POST `/adesoes/remover/{id}`
Remove adesão.

---

## 6. VEÍCULOS

### GET `/veiculos`
Módulo de veículos (HTML).

### GET `/veiculos/listar`
Lista veículos (JSON DataTable).

### GET `/veiculos/detalhes/{id}`
Detalhes do veículo.

### GET `/veiculos/buscar-dados-autocomplete`
Autocomplete veículos (param: `termoPesquisa`).

### POST `/veiculos/cadastrar`
Cadastra novo veículo.


**Parâmetros:**
| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| Placa | string | Sim | Placa do veículo |
| CodigoFipe | string | Sim* | Código FIPE (*se nacional) |
| Marca | string | Sim | Marca do veículo |
| Modelo | string | Sim | Modelo do veículo |
| AnoFabricacao | int | Sim | Ano de fabricação |
| AnoModelo | int | Sim | Ano do modelo |
| Cor | string | Não | Cor do veículo |
| Chassi | string | Não | Número do chassi |
| Renavam | string | Não | RENAVAM |
| TipoPlaca | int | Não | 1=Nacional, 2=Estrangeira |
| EstadosId | string (UUID) | Não | Estado de emplacamento |

### POST `/veiculos/editar/{id}`
Edita veículo.

### POST `/veiculos/remover/{id}`
Remove veículo.

---

## 7. VISTORIA

### GET `/vistoria/listar`
Lista vistorias (JSON DataTable).

### GET `/vistoria/fotos/{id}`
Fotos da vistoria.

### GET `/vistoria/documentos/{id}`
Documentos da vistoria.

### POST `/vistoria/cadastrar`
Cadastra nova vistoria.

**Parâmetros:**
| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| VendasId | string (UUID) | Sim | ID da venda |
| VeiculosId | string (UUID) | Sim | ID do veículo |
| DataVistoria | date | Sim | Data da vistoria |
| Observacoes | string | Não | Observações |

### POST `/vistoria/editar/{id}`
Edita vistoria.

### POST `/vistoria/aprovar/{id}`
Aprova vistoria.

### POST `/vistoria/reprovar/{id}`
Reprova vistoria.

---

## 8. FATURAS

### GET `/faturas/listar`
Lista faturas (JSON DataTable).

### GET `/faturas/exportar`
Exporta faturas.

### GET `/faturas/segunda-via/{id}`
Gera segunda via da fatura.

### POST `/faturas/cadastrar`
Cadastra fatura avulsa.

**Parâmetros:**
| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| AssociadosId | string (UUID) | Sim | ID do associado |
| Valor | decimal | Sim | Valor da fatura |
| DataVencimento | date | Sim | Data de vencimento |
| Descricao | string | Não | Descrição |
| Tipo | string | Não | Tipo da fatura |

### POST `/faturas/editar/{id}`
Edita fatura.

### POST `/faturas/remover/{id}`
Remove fatura.

### POST `/faturas/gerar`
Gera faturas em lote.

---

## 9. FINANCEIRO

### GET `/financeiro`
Módulo financeiro (HTML).

### GET `/financeiro/listar`
Lista lançamentos financeiros (JSON).

### GET `/financeiro/resumo`
Resumo financeiro (JSON).

### POST `/financeiro/cadastrar`
Cadastra lançamento financeiro.

### POST `/financeiro/editar/{id}`
Edita lançamento.


---

## 10. COBRANÇAS E BOLETOS

### GET `/cobrancas`
Módulo de cobranças (HTML).

### GET `/cobrancas/listar`
Lista cobranças (JSON).

### POST `/cobrancas/cadastrar`
Cadastra cobrança.

### POST `/cobrancas/gerar`
Gera cobranças em lote.

### POST `/cobrancas/enviar`
Envia cobrança ao cliente (email/WhatsApp).

### GET `/boletos`
Módulo de boletos (HTML).

### GET `/boletos/listar`
Lista boletos (JSON).

### GET `/boletos/exportar`
Exporta boletos.

### GET `/boletos/segunda-via/{id}`
Segunda via de boleto.

### GET `/boletos/remessa`
Gera arquivo de remessa bancária.

### POST `/boletos/gerar`
Gera boletos em lote.

---

## 11. PAGAMENTOS E CARTÃO

### GET `/pagamentos/listar`
Lista pagamentos (JSON).

### POST `/pagamentos/cadastrar`
Registra pagamento manual.

### POST `/pagamentos/cartao`
Processa pagamento via cartão.

**Parâmetros:**
| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| FaturasId | string (UUID) | Sim | ID da fatura |
| CartaoId | string (UUID) | Sim | ID do cartão cadastrado |
| Valor | decimal | Sim | Valor a cobrar |

### GET `/cartao/listar`
Lista cartões cadastrados.

### POST `/cartao/cadastrar`
Cadastra cartão de crédito.

### POST `/cartao/remover/{id}`
Remove cartão.

### GET `/creditos/listar`
Lista créditos.

### GET `/debitos/listar`
Lista débitos.

### GET `/inadimplentes/listar`
Lista inadimplentes.

### GET `/adimplentes/listar`
Lista adimplentes.

### GET `/contas-bancarias/listar`
Lista contas bancárias.

### POST `/contas-bancarias/cadastrar`
Cadastra conta bancária.

---

## 12. FATURAMENTO

### GET `/faturamento/listar`
Lista faturamento.

### POST `/faturamento/gerar`
Gera faturamento em lote.

---

## 13. PARCELAS E CARNÊ

### GET `/parcelas/listar`
Lista parcelas.

### POST `/parcelas/cadastrar`
Cadastra parcelas.

### POST `/carne/gerar`
Gera carnê de pagamento (PDF).

---

## 14. BÔNUS

### GET `/bonus`
Módulo de bônus (HTML).

### GET `/bonus/listar`
Lista bônus (JSON).

### GET `/bonus/consultar`
Consulta bônus disponível.

### POST `/bonus/cadastrar`
Cadastra bônus.

---

## 15. COMISSÕES

### GET `/comissoes`
Módulo de comissões (HTML).

### GET `/comissoes/listar`
Lista comissões (JSON).

### GET `/comissoes/extrato`
Extrato de comissões.

### POST `/comissoes/cadastrar`
Cadastra comissão.


---

## 16. SALDO

### GET `/saldo`
Módulo de saldo (HTML).

### GET `/saldo/listar`
Lista saldos.

### GET `/saldo/extrato`
Extrato de saldo.

### GET `/saldo/historico`
Histórico de saldo.

### POST `/saldo/sacar`
Efetua saque de saldo.

**Parâmetros:**
| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| Valor | decimal | Sim | Valor do saque (mín. R$200,00) |
| ContaBancariaId | string | Não | Conta para depósito |

---

## 17. CONSULTORES

### GET `/consultor`
Módulo de consultores (HTML).

### GET `/consultor/listar`
Lista consultores (JSON).

### GET `/consultor/buscar-dados-autocomplete`
Autocomplete consultores (param: `termoPesquisa`).

### POST `/consultor/cadastrar`
Cadastra consultor.

**Parâmetros:**
| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| Nome | string | Sim | Nome completo |
| Documento | string | Sim | CPF/CNPJ |
| Email | string | Sim | Email |
| DDD | string | Não | DDD |
| Telefone | string | Não | Telefone |

### POST `/consultor/editar/{id}`
Edita consultor.

---

## 18. REDE BINÁRIA

### GET `/rede-binaria`
Módulo de rede binária (HTML).

### GET `/rede-binaria/listar`
Lista membros da rede.

### GET `/rede-binaria/arvore`
Visualização em árvore da rede.

### GET `/rede-binaria/detalhes/{id}`
Detalhes de um nó da rede.

### GET `/rede-binaria/comissoes`
Comissões da rede binária.

---

## 19. INDICAÇÕES

### GET `/indicacoes`
Módulo de indicações (HTML).

### GET `/indicacoes/listar`
Lista indicações.

### GET `/indicacoes/detalhes/{id}`
Detalhes da indicação.

### GET `/indicacoes/comissoes`
Comissões de indicações.

### POST `/indicacoes/cadastrar`
Cadastra indicação.

---

## 20. RENOVAÇÃO

### GET `/renovacao`
Módulo de renovação (HTML).

### GET `/renovacao/listar`
Lista renovações.

### GET `/renovacao/detalhes/{id}`
Detalhes da renovação.

### POST `/renovacao/cadastrar`
Cadastra renovação.

### POST `/renovacao/gerar`
Gera renovação automática.

---

## 21. CANCELAMENTOS

### GET `/cancelamentos`
Módulo de cancelamentos (HTML).

### GET `/cancelamentos/listar`
Lista cancelamentos.

### GET `/cancelamentos/detalhes/{id}`
Detalhes do cancelamento.

### GET `/cancelamentos/motivos`
Lista motivos de cancelamento.

### POST `/cancelamentos/cadastrar`
Cadastra cancelamento.


**Parâmetros:**
| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| VendasId | string (UUID) | Sim | ID da venda |
| MotivoId | string | Sim | ID do motivo |
| DataCancelamento | date | Sim | Data do cancelamento |
| Observacoes | string | Não | Observações |

### POST `/cancelamentos/editar/{id}`
Edita cancelamento.

### GET `/pre-cancelamentos/listar`
Lista pré-cancelamentos.

### POST `/pre-cancelamentos/cadastrar`
Cadastra pré-cancelamento.

---

## 22. EVENTOS

### GET `/eventos/listar`
Lista eventos.

### GET `/eventos/detalhes/{id}`
Detalhes do evento.

### POST `/eventos/cadastrar`
Cadastra evento (sinistro).

**Parâmetros:**
| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| VendasId | string (UUID) | Sim | ID da venda |
| Tipo | string | Sim | Tipo do evento |
| DataEvento | date | Sim | Data do evento |
| Descricao | string | Sim | Descrição |
| Protocolo | string | Não | Protocolo (auto-gerado) |

### POST `/eventos/encerrar/{id}`
Encerra evento.

---

## 23. ASSISTÊNCIA

### GET `/assistencia/listar`
Lista assistências.

### GET `/assistencia/detalhes/{id}`
Detalhes da assistência.

### POST `/assistencia/cadastrar`
Cadastra assistência.

**Parâmetros:**
| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| VendasId | string (UUID) | Sim | ID da venda |
| Tipo | string | Sim | Tipo de assistência |
| DataAssistencia | date | Sim | Data |
| Descricao | string | Sim | Descrição |

### POST `/assistencia/encerrar/{id}`
Encerra assistência.

---

## 24. OCORRÊNCIAS

### GET `/ocorrencias`
Módulo de ocorrências (HTML).

### GET `/ocorrencias/listar`
Lista ocorrências.

### GET `/ocorrencias/detalhes/{id}`
Detalhes da ocorrência.

### POST `/ocorrencias/cadastrar`
Cadastra ocorrência.

### POST `/ocorrencias/editar/{id}`
Edita ocorrência.

---

## 25. MONITORAMENTO

### GET `/monitoramento/listar`
Lista veículos monitorados.

### GET `/monitoramento/rastrear/{id}`
Rastreia veículo em tempo real.

### GET `/monitoramento/historico/{id}`
Histórico de posições.

### GET `/monitoramento/alertas`
Lista alertas de monitoramento.

### GET `/rastreadores/listar`
Lista rastreadores.

---

## 26. COTAÇÃO

### GET `/cotacao`
Módulo de cotação (HTML).

### GET `/cotacao/listar`
Lista cotações.

### POST `/cotacao/cadastrar`
Cadastra cotação.

### POST `/cotacao/gerar`
Gera cotação (PDF).

### POST `/cotacao/enviar`
Envia cotação ao cliente.


---

## 27. PLANOS

### GET `/planos`
Módulo de planos (HTML).

### GET `/planos/listar`
Lista planos.

### GET `/planos/buscar-dados-autocomplete`
Autocomplete planos (param: `termoPesquisa`).

### POST `/planos/cadastrar`
Cadastra plano.

---

## 28. CATEGORIAS

### GET `/categorias`
Módulo de categorias (HTML).

### GET `/categorias/listar`
Lista categorias.

### GET `/categorias/buscar-dados-autocomplete`
Autocomplete categorias (param: `termoPesquisa`).

### POST `/categorias/cadastrar`
Cadastra categoria.

---

## 29. SERVIÇOS

### GET `/servicos`
Módulo de serviços (HTML).

### GET `/servicos/listar`
Lista serviços.

### GET `/servicos/buscar-dados-autocomplete`
Autocomplete serviços (param: `termoPesquisa`).

### POST `/servicos/cadastrar`
Cadastra serviço.

---

## 30. TABELA FIPE

### GET `/fipe/buscar`
Busca geral na FIPE.

### GET `/fipe/buscar-marca`
Busca marcas FIPE.

**Query Params:**
| Param | Descrição |
|-------|-----------|
| tipo | Tipo (carro, moto, caminhão) |

### GET `/fipe/buscar-modelo`
Busca modelos FIPE.

**Query Params:**
| Param | Descrição |
|-------|-----------|
| marcaId | ID da marca |

### GET `/fipe/buscar-ano`
Busca anos FIPE.

**Query Params:**
| Param | Descrição |
|-------|-----------|
| modeloId | ID do modelo |

### GET `/fipe/buscar-valor`
Busca valor FIPE.

**Query Params:**
| Param | Descrição |
|-------|-----------|
| modeloId | ID do modelo |
| anoId | ID do ano |

---

## 31. LOCALIDADES

### GET `/estados`
Módulo de estados.

### GET `/estados/listar`
Lista estados.

### GET `/estados/getEstadoUf/{UF}`
Busca estado por sigla UF.

**Resposta:**
```json
{
  "code": 200,
  "body": [{ "Id": "UUID", "Nome": "São Paulo", "PaisesId": "UUID" }]
}
```

### GET `/cidades`
Módulo de cidades.

### GET `/cidades/listar`
Lista cidades.

### GET `/cidades/getCidadesPorEstado/{estadoId}`
Lista cidades de um estado.

**Resposta:**
```json
{
  "code": 200,
  "body": [{ "Id": "UUID", "Nome": "Cidade" }]
}
```


### GET `/cidades/buscar-dados-autocomplete-estadoid`
Autocomplete cidades filtrado por estado.

**Query Params:**
| Param | Descrição |
|-------|-----------|
| estadoId | ID do estado |
| termoPesquisa | Texto digitado |

### GET `/paises/getPais/{id}`
Busca país por ID.

### GET `/externo`
Módulo de dados externos.

### GET `/externo/listar`
Lista dados externos.

### GET `/externo/getEstadoUf/{UF}`
Busca estado por UF (base externa).

---

## 32. CONTRATOS

### GET `/contratos`
Módulo de contratos.

### GET `/contratos/listar`
Lista contratos.

### POST `/contratos/gerar`
Gera contrato.

---

## 33. ASSINATURAS

### GET `/assinaturas/listar`
Lista assinaturas digitais.

### POST `/assinaturas/cadastrar`
Cadastra assinatura.

### POST `/assinaturas/validar`
Valida assinatura.

---

## 34. TERMOS

### GET `/termos/listar`
Lista termos de uso/adesão.

### POST `/termos/aceitar`
Aceita termo.

---

## 35. COMUNICAÇÃO

### POST `/whatsapp/enviar`
Envia mensagem via WhatsApp.

**Parâmetros:**
| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| Telefone | string | Sim | Número com DDD |
| Mensagem | string | Sim | Texto da mensagem |

### GET `/whatsapp/configurar`
Configurações do WhatsApp.

### POST `/sms/enviar`
Envia SMS.

**Parâmetros:**
| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| Telefone | string | Sim | Número com DDD |
| Mensagem | string | Sim | Texto do SMS |

### POST `/email/enviar`
Envia email.

**Parâmetros:**
| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| Destinatario | string | Sim | Email destino |
| Assunto | string | Sim | Assunto |
| Corpo | string | Sim | Corpo do email (HTML) |

### GET `/mensagens`
Módulo de mensagens.

### GET `/mensagens/listar`
Lista mensagens.

### GET `/mensagens/detalhes/{id}`
Detalhes da mensagem.

### POST `/mensagens/enviar`
Envia mensagem interna.

---

## 36. ARQUIVOS E DOCUMENTOS

### GET `/arquivos`
Módulo de arquivos.

### GET `/arquivos/listar`
Lista arquivos.

### GET `/arquivos/download/{id}`
Download de arquivo.

### POST `/arquivos/upload`
Upload de arquivo (multipart/form-data).

**Parâmetros:**
| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| arquivo | file | Sim | Arquivo para upload |
| ModuloId | string (UUID) | Sim | ID do registro vinculado |
| Modulo | string | Sim | Nome do módulo |

### POST `/arquivos/remover`
Remove arquivo.

**Parâmetros:**
| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| Id | string (UUID) | Sim | ID do arquivo |


---

## 37. GERAÇÃO DE PDF

### GET `/pdf/gerar/{id}`
Gera PDF genérico.

### GET `/pdf/contrato/{id}`
Gera PDF de contrato.

### GET `/pdf/boleto/{id}`
Gera PDF de boleto.

### GET `/pdf/carne/{id}`
Gera PDF de carnê.

---

## 38. IMPORTAÇÃO

### POST `/importar/boletos`
Importa boletos (arquivo de retorno bancário).

**Content-Type:** `multipart/form-data`

### POST `/importar/associados`
Importa associados em lote (CSV/Excel).

**Content-Type:** `multipart/form-data`

---

## 39. EXPORTAÇÃO

### GET `/exportar/associados`
Exporta associados (CSV/Excel).

### GET `/exportar/vendas`
Exporta vendas.

### GET `/exportar/financeiro`
Exporta financeiro.

### GET `/exportar/faturas`
Exporta faturas.

---

## 40. RELATÓRIOS

### GET `/relatorios/geral`
Relatório geral.

### GET `/relatorios/vendas`
Relatório de vendas.

### GET `/relatorios/financeiro`
Relatório financeiro.

### GET `/relatorios/associados`
Relatório de associados.

### GET `/relatorios/cancelamentos`
Relatório de cancelamentos.

### GET `/relatorios/bonus`
Relatório de bônus.

### GET `/relatorios/comissoes`
Relatório de comissões.

### GET `/relatorios/inadimplencia`
Relatório de inadimplência.

### GET `/relatorios/adesoes`
Relatório de adesões.

### GET `/relatorios/renovacoes`
Relatório de renovações.

### GET `/relatorios/eventos`
Relatório de eventos.

### GET `/relatorios/assistencias`
Relatório de assistências.

---

## 41. CONFIGURAÇÕES

### GET `/configuracoes/listar`
Lista todas as configurações.

### GET `/configuracoes/geral`
Configurações gerais.

### GET `/configuracoes/empresa`
Configurações da empresa.

### GET `/configuracoes/emails`
Configurações de emails.

### GET `/configuracoes/bonus`
Configurações de bônus.

### GET `/configuracoes/planos`
Configurações de planos.

### GET `/configuracoes/faturas`
Configurações de faturas.

### GET `/configuracoes/vendas`
Configurações de vendas.

### GET `/configuracoes/comissoes`
Configurações de comissões.

### GET `/configuracoes/assinaturas`
Configurações de assinaturas digitais.

### GET `/configuracoes/monitoramento`
Configurações de monitoramento.

### GET `/configuracoes/integracoes`
Configurações de integrações.

---

## 42. INTEGRAÇÕES

### GET `/integracoes/hinovapay`
Configuração da integração HinovaPay (gateway pagamento).

### GET `/integracoes/siprov`
Configuração da integração Siprov.

### POST `/webhook/receber`
Endpoint para receber webhooks de integrações externas.

---

## 43. USUÁRIOS E PERMISSÕES

### GET `/usuarios`
Módulo de usuários.

### GET `/usuarios/listar`
Lista usuários.

### POST `/usuarios/cadastrar`
Cadastra usuário.

**Parâmetros:**
| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| Nome | string | Sim | Nome completo |
| Login | string | Sim | Login (CPF/email) |
| Senha | string | Sim | Senha |
| Email | string | Sim | Email |
| Perfil | string | Sim | Perfil de acesso |

### POST `/usuarios/editar/{id}`
Edita usuário.

### POST `/usuarios/remover/{id}`
Remove usuário.


### POST `/usuario/atualizar`
Atualiza dados/senha do usuário logado.

**Parâmetros:**
| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| SenhaModal | string | Sim | Nova senha |
| ConfirmarSenhaModal | string | Sim | Confirmação da senha |

### GET `/permissoes`
Módulo de permissões.

### GET `/permissoes/listar`
Lista permissões.

---

## 44. PERFIL

### GET `/perfil`
Módulo de perfil.

### GET `/perfil/dados`
Dados do perfil do usuário logado.

### POST `/perfil/editar`
Edita perfil.

### POST `/perfil/atualizar`
Atualiza perfil.

---

## 45. SUPORTE

### GET `/suporte`
Módulo de suporte.

### GET `/suporte/listar`
Lista tickets de suporte.

### GET `/suporte/detalhes/{id}`
Detalhes do ticket.

### POST `/suporte/cadastrar`
Cadastra ticket de suporte.

---

## 46. LOGS

### GET `/logs`
Módulo de logs.

### GET `/logs/listar`
Lista logs do sistema.

### GET `/logs/detalhes/{id}`
Detalhes do log.

### GET `/logs/exportar`
Exporta logs.

---

## 47. TAREFAS

### GET `/tarefas`
Módulo de tarefas.

### GET `/tarefas/listar`
Lista tarefas.

### POST `/tarefas/cadastrar`
Cadastra tarefa.

### POST `/tarefas/concluir/{id}`
Marca tarefa como concluída.

---

## 48. NOTIFICAÇÕES

### POST `/notificacoes/enviar`
Envia notificação.

### GET `/notificacoes/configurar`
Configurações de notificações.

---

## 49. FORNECEDORES

### GET `/fornecedores/listar`
Lista fornecedores.

---

## APIs EXTERNAS CONSUMIDAS

### GET `https://viacep.com.br/ws/{cep}/json/`
Consulta endereço por CEP.

### GET `https://api.southti.com.br/AtualizacoesSistemas/BuscarAtualizacoes/`
Consulta atualizações do sistema.

**Headers:**
```
Authorization: qrb5cvtaJkqJq0o0opYugCtsnC9Bc0WVov1dcdkpipqmJC9WqrmLckWrlpfmJ3A2vrmdE1kprCPMc052lvWQJqnSHzhJn0I5
```

**Query Params:**
| Param | Descrição |
|-------|-----------|
| Tipo | IN('A','N') para atualizações, NO para notificações |
| ServicosId | 18 (ID do serviço aEasy) |
| DataVingencia | Filtro de data |

### GET `https://nominatim.openstreetmap.org/search`
Geocodificação (latitude/longitude).

**Query Params:**
| Param | Descrição |
|-------|-----------|
| q | Endereço para busca |
| format | jsonv2 |

---

## PADRÕES DE RESPOSTA

### Sucesso (POST)
```json
{
  "mensagem": "Cadastro realizado com sucesso.",
  "redirect": "/modulo",
  "aviso": null,
  "reload": false
}
```

### Erro (POST)
```json
{
  "mensagem": "Mensagem de erro detalhada."
}
```

### Listagem (GET)
```json
{
  "code": 200,
  "body": [{ ... }]
}
```

### Autocomplete (GET)
```json
{
  "results": [
    { "id": "UUID", "text": "Nome para exibição" }
  ]
}
```

---

## RESUMO POR MÉTODO

### Total de Endpoints GET: ~165
- Páginas HTML (módulos): ~30
- Listagens JSON (DataTable): ~40
- Detalhes/Consultas: ~35
- Exportações: ~10
- Autocomplete: ~10
- Configurações: ~15
- Relatórios: ~12
- PDFs: ~5
- Outros: ~8

### Total de Endpoints POST: ~85
- Cadastros: ~35
- Edições: ~20
- Remoções: ~12
- Aprovações/Reprovações: ~5
- Comunicação (envio): ~5
- Geração em lote: ~5
- Importações: ~3

### **TOTAL GERAL: ~250 endpoints**
