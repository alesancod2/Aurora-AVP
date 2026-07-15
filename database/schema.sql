-- ============================================
-- Aurora AVP - Schema de Banco de Dados
-- Baseado nos campos retornados pela API aEasy
-- 
-- Propósito: Cache local dos dados do aEasy para:
--   1. Reduzir chamadas à API (rate limit / performance)
--   2. Consultas históricas sem depender da sessão PHP
--   3. Virtualização de dados (lazy loading)
--   4. Relatórios offline
--
-- Banco: Supabase PostgreSQL (ou qualquer PostgreSQL)
-- Projeto: zjacembodtjrkynfmtxf
-- ============================================

-- Extensão para UUIDs
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- 1. CONSULTORES (hierarquia gestor/vendedor)
-- Fonte: GET /consultores/listagem (~5.918 registros)
-- ============================================
CREATE TABLE consultores (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    consultores_id VARCHAR(100) UNIQUE NOT NULL,  -- ID interno aEasy
    individuos_nome VARCHAR(255) NOT NULL,
    individuos_documento VARCHAR(20),              -- CPF/CNPJ
    individuos_nome_fantasia VARCHAR(255),
    individuos_email VARCHAR(255),
    individuos_data_nascimento DATE,
    individuos_sexo VARCHAR(20),
    individuos_login VARCHAR(50),                  -- CPF login
    individuos_contatos_ddd VARCHAR(5),
    individuos_contatos_telefone VARCHAR(20),
    
    -- Endereço
    individuos_enderecos_logradouro VARCHAR(500),
    individuos_enderecos_numero VARCHAR(20),
    individuos_enderecos_bairro VARCHAR(100),
    individuos_enderecos_cep VARCHAR(15),
    individuos_enderecos_cidades_nome VARCHAR(100),
    individuos_enderecos_estados_nome VARCHAR(50),
    individuos_enderecos_estados_uf VARCHAR(5),
    
    -- Classificação
    consultores_tipo_consultor VARCHAR(50),        -- Texto: Consultor, Vendedor, Gestor
    consultores_tipo_consultor_enum SMALLINT,      -- 1=Consultor,2=Vendedor,3=Sede,4=Indicador,5=Regional,6=Gestor,7=Interno
    consultores_situacao_cadastro VARCHAR(50),     -- Ativo, Suspenso, etc
    consultores_situacao_cadastro_enum SMALLINT,   -- 1=Pre,2=Ativo,3=Suspenso,4=Bloqueado,5=Cancelado,6=Ativo/ComissaoSuspensa
    consultores_gerar_comissao BOOLEAN DEFAULT true,
    consultores_data_cadastro TIMESTAMP,
    
    -- Hierarquia (GESTOR_ID)
    consultores_patrocinador_individuos_nome VARCHAR(255), -- Nome do gestor
    consultores_indicador_individuos_nome VARCHAR(255),    -- Nome do indicador
    gestor_id UUID REFERENCES consultores(id),            -- FK para gestor (computed)
    
    -- Financeiro
    consultores_niveis_nome VARCHAR(100),          -- Nível de comissão
    grupos_empresas_nome VARCHAR(100),             -- Centro de custo/Regional
    grupos_consultores_nome VARCHAR(100),          -- Grupo (Externo/Interno)
    
    -- Dados bancários
    individuos_dados_bancarios_bancos_nome VARCHAR(100),
    individuos_dados_bancarios_conta VARCHAR(50),
    individuos_dados_bancarios_agencia VARCHAR(20),
    
    -- Controle de sincronização
    synced_at TIMESTAMP DEFAULT NOW(),
    raw_data JSONB,                               -- Dados brutos do aEasy (backup)
    
    CONSTRAINT uq_consultores_documento UNIQUE (individuos_documento)
);

-- Índices para performance
CREATE INDEX idx_consultores_tipo ON consultores(consultores_tipo_consultor_enum);
CREATE INDEX idx_consultores_situacao ON consultores(consultores_situacao_cadastro_enum);
CREATE INDEX idx_consultores_gestor ON consultores(gestor_id);
CREATE INDEX idx_consultores_centro_custo ON consultores(grupos_empresas_nome);
CREATE INDEX idx_consultores_patrocinador ON consultores(consultores_patrocinador_individuos_nome);


-- ============================================
-- 2. VENDAS/ASSOCIADOS (dados comerciais)
-- Fonte: POST /vendas/listagem (~31.705 registros, 225 campos)
-- ============================================
CREATE TABLE vendas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    vendas_id VARCHAR(100) UNIQUE NOT NULL,        -- ID interno aEasy
    vendas_clientes_id VARCHAR(100),
    
    -- Dados do Associado
    clientes_individuos_nome VARCHAR(255),
    clientes_individuos_documento VARCHAR(20),      -- CPF/CNPJ
    clientes_individuos_email VARCHAR(255),
    clientes_individuos_data_nascimento DATE,
    clientes_individuos_sexo VARCHAR(20),
    clientes_individuos_rg VARCHAR(30),
    clientes_individuos_contatos_ddd VARCHAR(5),
    clientes_individuos_contatos_telefone VARCHAR(20),
    clientes_individuos_id VARCHAR(100),
    
    -- Endereço do Associado
    individuos_enderecos_logradouro VARCHAR(500),
    individuos_enderecos_numero VARCHAR(20),
    individuos_enderecos_bairro VARCHAR(100),
    individuos_enderecos_cep VARCHAR(15),
    individuos_enderecos_cidades_nome VARCHAR(100),
    individuos_enderecos_estados_nome VARCHAR(50),
    individuos_enderecos_estados_uf VARCHAR(5),
    individuos_enderecos_complemento VARCHAR(200),
    
    -- Veículo
    vendas_carros_placa VARCHAR(10),
    vendas_carros_marcas_nome VARCHAR(100),
    vendas_carros_modelos_nome VARCHAR(200),
    vendas_carros_anos_modelos_nome VARCHAR(10),
    carros_ano_fabricacao VARCHAR(10),
    vendas_carros_carros_cor VARCHAR(50),
    carros_chassi VARCHAR(50),
    carros_renavan VARCHAR(30),
    vendas_carros_codigo_fipe VARCHAR(20),
    vendas_carros_categorias_carros_nome VARCHAR(100),   -- Categoria
    vendas_carros_categorias_planos_nome VARCHAR(100),   -- Plano
    vendas_carros_categorias_planos_id VARCHAR(100),
    vendas_carros_placa_implemento VARCHAR(10),
    vendas_carros_placa_implemento2 VARCHAR(10),
    vendas_carros_placa_implemento3 VARCHAR(10),
    
    -- Financeiro
    vendas_valor DECIMAL(12,2),                    -- Valor mensalidade
    vendas_carros_valor_adesao DECIMAL(12,2),      -- Valor adesão
    vendas_carros_valor_fipe DECIMAL(12,2),        -- Valor FIPE
    vendas_carros_cota DECIMAL(12,2),              -- Valor da cota
    vendas_carros_valor_mensal DECIMAL(12,2),      -- Valor mensal
    vendas_carros_valor_total DECIMAL(12,2),       -- Valor total
    vendas_vencimento SMALLINT,                    -- Dia vencimento (5,10,15,20,25,30)
    vendas_forma_pagamento_enum SMALLINT,          -- 1=Boleto, 2=Cartão
    vendas_quantidade_faturas_pagas INTEGER DEFAULT 0,
    vendas_quantidade_faturas_atraso INTEGER DEFAULT 0,
    vendas_dias_atraso INTEGER DEFAULT 0,
    vendas_parcelas INTEGER DEFAULT 12,
    vendas_isenta_cobranca BOOLEAN DEFAULT false,
    
    -- Situação / Status
    vendas_situacao VARCHAR(50),                    -- Texto: Ativo, Suspenso, etc
    vendas_situacao_enum SMALLINT NOT NULL,         -- 1=Ativo,2=Suspenso,3=Cancelado,4=AguardandoPgto,5=Novo,6=AguardandoVistoria...
    vendas_classificacao VARCHAR(50),               -- Nova Adesão, Renovação, Reativação
    vendas_tipo_suspensao VARCHAR(50),
    vendas_motivos_cancelamentos_nome VARCHAR(200),
    vendas_motivos_cancelamentos_id VARCHAR(100),
    
    -- Datas
    vendas_data_cadastro TIMESTAMP,
    vendas_data_ativacao DATE,
    vendas_data_cancelamento DATE,
    vendas_data_suspensao DATE,
    vendas_data_reativacao DATE,
    vendas_data_fidelidade DATE,
    vendas_data_pagamento DATE,                     -- Data contrato
    vendas_data_ultimo_fatura_carne DATE,
    vendas_data_impressao_carne DATE,
    
    -- Consultor
    vendas_consultores_id VARCHAR(100),             -- ID do consultor
    consultores_nome VARCHAR(255),
    consultores_login VARCHAR(50),
    consultores_email VARCHAR(255),
    consultores_ddd VARCHAR(5),
    consultores_telefone VARCHAR(20),
    consultores_centro_custo_id VARCHAR(100),       -- ID da regional
    consultores_centro_custo_nome VARCHAR(100),     -- Nome da regional
    
    -- Cotação original
    cotacoes_numero_cotacao VARCHAR(50),
    
    -- Controle
    vendas_produtos_id VARCHAR(10),                 -- 1=Proteção, 5=Rastreamento
    vendas_produtos_nome VARCHAR(100),
    vendas_contabiliza_para_meta BOOLEAN DEFAULT true,
    
    -- Sincronização
    synced_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    raw_data JSONB,                                -- Todos os 225 campos brutos
    
    -- FK
    consultor_ref UUID REFERENCES consultores(id)
);

-- Índices otimizados para Dashboard Comercial
CREATE INDEX idx_vendas_situacao ON vendas(vendas_situacao_enum);
CREATE INDEX idx_vendas_consultor ON vendas(vendas_consultores_id);
CREATE INDEX idx_vendas_data_cadastro ON vendas(vendas_data_cadastro);
CREATE INDEX idx_vendas_data_ativacao ON vendas(vendas_data_ativacao);
CREATE INDEX idx_vendas_data_cancelamento ON vendas(vendas_data_cancelamento);
CREATE INDEX idx_vendas_centro_custo ON vendas(consultores_centro_custo_id);
CREATE INDEX idx_vendas_plano ON vendas(vendas_carros_categorias_planos_id);
CREATE INDEX idx_vendas_placa ON vendas(vendas_carros_placa);
CREATE INDEX idx_vendas_documento ON vendas(clientes_individuos_documento);
CREATE INDEX idx_vendas_classificacao ON vendas(vendas_classificacao);
CREATE INDEX idx_vendas_produto ON vendas(vendas_produtos_id);

-- Índice composto para queries do dashboard
CREATE INDEX idx_vendas_dashboard ON vendas(vendas_consultores_id, vendas_situacao_enum, vendas_data_cadastro);


-- ============================================
-- 3. FATURAS (fluxo de caixa)
-- Fonte: POST /fluxo-caixa/buscar-pagina
-- ============================================
CREATE TABLE faturas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    faturas_id VARCHAR(100) UNIQUE NOT NULL,
    
    -- Datas
    faturas_data_vencimento DATE,
    faturas_data_pagamento DATE,
    faturas_data_original DATE,
    faturas_data_credito DATE,
    
    -- Valores
    faturas_valor DECIMAL(12,2),
    faturas_valor_pago DECIMAL(12,2),
    faturas_valor_juros DECIMAL(12,2),
    faturas_valor_tarifa_cobranca DECIMAL(12,2),
    
    -- Identificação
    faturas_numero_fatura_boleto VARCHAR(50),
    faturas_parcela INTEGER,
    faturas_itens_nome VARCHAR(500),
    faturas_itens_valor DECIMAL(12,2),
    
    -- Situação
    situacao VARCHAR(30),                          -- Pago, Aberto, Cancelado
    tipo_fatura VARCHAR(50),                       -- Contribuição, Adesão, Avulsa...
    forma_pagamento VARCHAR(50),
    
    -- Associado
    individuos_nome VARCHAR(255),
    individuos_documento VARCHAR(20),
    individuos_contatos_ddd VARCHAR(5),
    individuos_contatos_contato VARCHAR(20),
    individuos_email VARCHAR(255),
    
    -- Venda relacionada
    vendas_placa VARCHAR(10),
    vendas_consultores_nome VARCHAR(255),
    vendas_situacao_nome VARCHAR(50),
    vendas_data_cadastro DATE,
    vendas_carros_modelos_nome VARCHAR(200),
    vendas_carros_categorias_carros_nome VARCHAR(100),
    vendas_categorias_planos_nome VARCHAR(100),
    centro_custo VARCHAR(100),
    
    -- Controle
    synced_at TIMESTAMP DEFAULT NOW(),
    raw_data JSONB
);

CREATE INDEX idx_faturas_vencimento ON faturas(faturas_data_vencimento);
CREATE INDEX idx_faturas_pagamento ON faturas(faturas_data_pagamento);
CREATE INDEX idx_faturas_situacao ON faturas(situacao);
CREATE INDEX idx_faturas_tipo ON faturas(tipo_fatura);
CREATE INDEX idx_faturas_consultor ON faturas(vendas_consultores_nome);


-- ============================================
-- 4. COTAÇÕES
-- Fonte: GET /cotacoes/listagem
-- ============================================
CREATE TABLE cotacoes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cotacoes_id VARCHAR(100) UNIQUE NOT NULL,
    cotacoes_numero_cotacao VARCHAR(50),
    
    -- Cliente
    cliente_nome VARCHAR(255),
    cliente_documento VARCHAR(20),
    cliente_telefone VARCHAR(20),
    cliente_email VARCHAR(255),
    
    -- Veículo
    placa VARCHAR(10),
    marca VARCHAR(100),
    modelo VARCHAR(200),
    ano_modelo VARCHAR(10),
    
    -- Plano/Valor
    plano_nome VARCHAR(100),
    valor_mensal DECIMAL(12,2),
    valor_adesao DECIMAL(12,2),
    
    -- Situação
    situacao VARCHAR(50),                          -- Em aberto, Convertida, Expirada
    data_cotacao TIMESTAMP,
    data_conversao DATE,
    
    -- Consultor
    consultores_id VARCHAR(100),
    consultores_nome VARCHAR(255),
    centro_custo VARCHAR(100),
    
    -- Controle
    synced_at TIMESTAMP DEFAULT NOW(),
    raw_data JSONB
);

CREATE INDEX idx_cotacoes_situacao ON cotacoes(situacao);
CREATE INDEX idx_cotacoes_consultor ON cotacoes(consultores_id);
CREATE INDEX idx_cotacoes_data ON cotacoes(data_cotacao);


-- ============================================
-- 5. EVENTOS (sinistros)
-- Fonte: GET /eventos/listagem
-- ============================================
CREATE TABLE eventos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    protecao_eventos_id VARCHAR(100) UNIQUE NOT NULL,
    protecao_eventos_numero_evento VARCHAR(50),
    
    -- Dados do evento
    tipo_atendimento VARCHAR(50),                  -- Associado, Terceiro
    situacao VARCHAR(50),                          -- Aberto, Concluído, Cancelado
    etapa VARCHAR(100),                            -- Cadastro, Análise, Orçamento, Reparo, Entrega
    
    -- Datas
    data_cadastro TIMESTAMP,
    data_fato DATE,
    data_conclusao DATE,
    
    -- Venda relacionada
    vendas_id VARCHAR(100),
    placa VARCHAR(10),
    associado_nome VARCHAR(255),
    consultor_nome VARCHAR(255),
    
    -- Controle
    synced_at TIMESTAMP DEFAULT NOW(),
    raw_data JSONB
);

CREATE INDEX idx_eventos_situacao ON eventos(situacao);
CREATE INDEX idx_eventos_data ON eventos(data_cadastro);


-- ============================================
-- 6. CENTROS DE CUSTO (Regionais/Sedes)
-- ============================================
CREATE TABLE centros_custo (
    id VARCHAR(100) PRIMARY KEY,                   -- ID do aEasy (Empresa, Juazeiro, UUID...)
    nome VARCHAR(200) NOT NULL,                    -- "01 - AutoVale Clube de Benefícios"
    codigo VARCHAR(5),                             -- "01", "02", etc
    cidade VARCHAR(100),
    estado VARCHAR(5),
    ativo BOOLEAN DEFAULT true
);

-- Seed com dados conhecidos
INSERT INTO centros_custo (id, nome, codigo, cidade, estado) VALUES
('Empresa', '01 - AutoVale Clube de Benefícios', '01', NULL, NULL),
('2DFB8E7F-09CA-527B-0E36-CFF08A943C19', '02 - Petrolina - PE', '02', 'Petrolina', 'PE'),
('Juazeiro', '03 - Juazeiro - BA', '03', 'Juazeiro', 'BA'),
('Bomfim', '04 - Sr. Bomfim - BA', '04', 'Senhor do Bomfim', 'BA'),
('Itabuna', '05 - Itabuna - BA', '05', 'Itabuna', 'BA'),
('JNorte', '06 - J. Norte - CE', '06', 'Juazeiro do Norte', 'CE'),
('Maceio', '07 - Maceió - AL', '07', 'Maceió', 'AL'),
('Salgueiro', '08 - Salgueiro - PE', '08', 'Salgueiro', 'PE'),
('Arapiraca1', '09 - Arapiraca - AL', '09', 'Arapiraca', 'AL'),
('SMiguelCampos', '10 - S. Miguel Campos - AL', '10', 'São Miguel dos Campos', 'AL'),
('C2D9F83C-E5ED-10FC-C44F-F97B974C84F2', '11 - Carpina - PE', '11', 'Carpina', 'PE'),
('DFA87AB6-49FF-B6C0-C971-BB9FDBF343EC', '12 - Serra Talhada - PE', '12', 'Serra Talhada', 'PE'),
('4808A9B4-1D5E-1D95-ECE6-D09FA4F5316F', '13 - Própria - SE', '13', 'Propriá', 'SE'),
('C076FFB2-A1FF-DA78-D2C2-B8049B1C8F91', '14 - Horizonte - CE', '14', 'Horizonte', 'CE'),
('746E6EAC-32E8-455C-7230-BC41043D89B0', '15 - Feira de Santana - BA', '15', 'Feira de Santana', 'BA'),
('CF7C65F2-833C-F6E6-D726-426982B1453C', '16 - Recife - PE', '16', 'Recife', 'PE'),
('AA67330C-53E7-2B5B-1271-78E26734792E', '17 - Meep Pagamentos', '17', NULL, NULL);


-- ============================================
-- 7. PLANOS
-- ============================================
CREATE TABLE planos (
    id VARCHAR(100) PRIMARY KEY,
    nome VARCHAR(100) NOT NULL,
    ativo BOOLEAN DEFAULT true
);

INSERT INTO planos (id, nome) VALUES
('1341acfb-93a2-11ee-98aa-0244bdb3ddcc', 'Básico'),
('1341b209-93a2-11ee-98aa-0244bdb3ddcc', 'VIP'),
('1341b058-93a2-11ee-98aa-0244bdb3ddcc', 'TOP'),
('1341cd94-93a2-11ee-98aa-0244bdb3ddcc', 'Truck'),
('AA4433F7-F47F-E7D4-545C-759305B53719', 'Start'),
('EF60577E-8A33-77FC-F1B4-505419E5C581', 'Premium'),
('4688130B-EAF8-2F75-1BC8-F95DEF15B15A', 'Agregado'),
('E98BFBF4-466C-29AA-312A-CEC2E905819D', 'Básico Truck'),
('C695DF0A-54E4-9C3F-B391-EDE11CB231EA', 'Top Truck'),
('EB11A116-C44A-6838-F6A8-4770CFE875BB', 'Vip Truck'),
('EA8DF053-0685-8C94-7ADD-9D133CA7AA04', 'Comodato'),
('7859ADE8-45D0-845C-A908-6EDCEC597664', 'Frota Publica'),
('480208CD-E318-36DA-224D-03929FAD6AC5', 'Plano Automóvel Elétrico'),
('124B3EAF-2422-4EEF-36F4-2F994D827DB0', 'Plano Automóvel Híbrido'),
('B86C7BC6-8F62-D96F-6B38-05CE0BDFBED1', 'Rastreador Comodato');


-- ============================================
-- 8. CACHE DE SINCRONIZAÇÃO (controle)
-- ============================================
CREATE TABLE sync_log (
    id SERIAL PRIMARY KEY,
    tabela VARCHAR(50) NOT NULL,
    tipo VARCHAR(20) NOT NULL,                     -- 'full', 'incremental', 'partial'
    registros_processados INTEGER DEFAULT 0,
    registros_inseridos INTEGER DEFAULT 0,
    registros_atualizados INTEGER DEFAULT 0,
    filtros_aplicados JSONB,
    iniciado_em TIMESTAMP NOT NULL DEFAULT NOW(),
    concluido_em TIMESTAMP,
    duracao_ms INTEGER,
    status VARCHAR(20) DEFAULT 'running',          -- running, success, error
    erro TEXT
);

CREATE INDEX idx_sync_log_tabela ON sync_log(tabela, iniciado_em DESC);


-- ============================================
-- 9. VIEWS MATERIALIZADAS (Dashboard KPIs)
-- Pré-computam indicadores para performance
-- ============================================

-- View: Indicadores por consultor por mês
CREATE MATERIALIZED VIEW mv_indicadores_consultor_mes AS
SELECT
    vendas_consultores_id,
    consultores_nome,
    consultores_centro_custo_nome,
    DATE_TRUNC('month', vendas_data_cadastro) AS mes,
    COUNT(*) AS total_cotacoes,
    COUNT(*) FILTER (WHERE vendas_situacao_enum = 1) AS vendas_ativas,
    COUNT(*) FILTER (WHERE vendas_situacao_enum = 3) AS canceladas,
    COUNT(*) FILTER (WHERE vendas_situacao_enum = 2) AS suspensas,
    SUM(vendas_carros_valor_mensal) FILTER (WHERE vendas_situacao_enum = 1) AS valor_vendido,
    AVG(vendas_carros_valor_mensal) FILTER (WHERE vendas_situacao_enum = 1) AS ticket_medio,
    ROUND(
        COUNT(*) FILTER (WHERE vendas_situacao_enum = 1)::NUMERIC / 
        NULLIF(COUNT(*), 0) * 100, 1
    ) AS taxa_conversao
FROM vendas
WHERE vendas_data_cadastro IS NOT NULL
GROUP BY vendas_consultores_id, consultores_nome, consultores_centro_custo_nome, DATE_TRUNC('month', vendas_data_cadastro);

CREATE UNIQUE INDEX idx_mv_indicadores ON mv_indicadores_consultor_mes(vendas_consultores_id, mes);

-- View: Ranking consolidado por gestor
CREATE MATERIALIZED VIEW mv_ranking_gestores AS
SELECT
    g.consultores_id AS gestor_id,
    g.individuos_nome AS gestor_nome,
    g.grupos_empresas_nome AS regional,
    COUNT(DISTINCT v.vendas_id) AS total_equipe_cotacoes,
    COUNT(DISTINCT v.vendas_id) FILTER (WHERE v.vendas_situacao_enum = 1) AS total_equipe_vendas,
    SUM(v.vendas_carros_valor_mensal) FILTER (WHERE v.vendas_situacao_enum = 1) AS total_equipe_valor,
    COUNT(DISTINCT c2.consultores_id) AS membros_equipe
FROM consultores g
LEFT JOIN consultores c2 ON c2.consultores_patrocinador_individuos_nome = g.individuos_nome
LEFT JOIN vendas v ON v.vendas_consultores_id = c2.consultores_id OR v.vendas_consultores_id = g.consultores_id
WHERE g.consultores_tipo_consultor_enum IN (5, 6)
  AND v.vendas_data_cadastro >= DATE_TRUNC('month', CURRENT_DATE)
GROUP BY g.consultores_id, g.individuos_nome, g.grupos_empresas_nome;

-- Refresh automático (via pg_cron ou trigger)
-- REFRESH MATERIALIZED VIEW CONCURRENTLY mv_indicadores_consultor_mes;
-- REFRESH MATERIALIZED VIEW CONCURRENTLY mv_ranking_gestores;


-- ============================================
-- 10. RLS (Row Level Security) - Supabase
-- ============================================
ALTER TABLE vendas ENABLE ROW LEVEL SECURITY;
ALTER TABLE consultores ENABLE ROW LEVEL SECURITY;
ALTER TABLE faturas ENABLE ROW LEVEL SECURITY;

-- Política: admin vê tudo
CREATE POLICY "Admin full access" ON vendas FOR ALL USING (true);
CREATE POLICY "Admin full access" ON consultores FOR ALL USING (true);
CREATE POLICY "Admin full access" ON faturas FOR ALL USING (true);
