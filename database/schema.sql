-- ═══════════════════════════════════════════════════════════
-- Aurora AVP - Schema do Banco de Dados (Supabase)
-- Tabelas de cache e preferencias do usuario
-- ═══════════════════════════════════════════════════════════

-- ─── TABELA: Cache de Relatorios ────────────────────────────
-- Armazena resultados de consultas para evitar chamadas repetidas
-- a API externa. Cache valido por 30 minutos.

CREATE TABLE IF NOT EXISTS relatorios_cache (
  id BIGSERIAL PRIMARY KEY,
  filtro_hash TEXT UNIQUE NOT NULL,
  tipo_data TEXT,
  data_inicial DATE,
  data_final DATE,
  ordenacao TEXT,
  retornar_lider TEXT,
  dados JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index para busca rapida por hash
CREATE INDEX IF NOT EXISTS idx_relatorios_cache_hash 
  ON relatorios_cache(filtro_hash);

-- Index para limpeza de cache antigo
CREATE INDEX IF NOT EXISTS idx_relatorios_cache_updated 
  ON relatorios_cache(updated_at);

-- Constraint UNIQUE para permitir upsert
ALTER TABLE relatorios_cache 
  DROP CONSTRAINT IF EXISTS relatorios_cache_filtro_hash_key;
ALTER TABLE relatorios_cache 
  ADD CONSTRAINT relatorios_cache_filtro_hash_key UNIQUE (filtro_hash);


-- ─── TABELA: Gestores Ocultos ───────────────────────────────
-- Preferencias do usuario para ocultar gestores da visualizacao.
-- Persiste no banco para sincronizar entre dispositivos.

CREATE TABLE IF NOT EXISTS gestores_ocultos (
  id BIGSERIAL PRIMARY KEY,
  gestor_nome TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gestores_ocultos_nome 
  ON gestores_ocultos(gestor_nome);


-- ─── TABELA: Sessoes de Login ───────────────────────────────
-- Cache de sessoes ativas para evitar re-login frequente

CREATE TABLE IF NOT EXISTS sessoes_cache (
  id BIGSERIAL PRIMARY KEY,
  usuario_cpf TEXT NOT NULL,
  session_cookie TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessoes_cache_cpf 
  ON sessoes_cache(usuario_cpf);

CREATE INDEX IF NOT EXISTS idx_sessoes_cache_expires 
  ON sessoes_cache(expires_at);


-- ─── POLITICAS RLS (Row Level Security) ─────────────────────
-- Habilitar RLS para protecao dos dados

ALTER TABLE relatorios_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE gestores_ocultos ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessoes_cache ENABLE ROW LEVEL SECURITY;

-- Politica: permitir acesso anonimo (anon key) para leitura/escrita
-- Ajustar conforme necessidade de seguranca do projeto

CREATE POLICY "Acesso publico relatorios_cache" ON relatorios_cache
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Acesso publico gestores_ocultos" ON gestores_ocultos
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Acesso publico sessoes_cache" ON sessoes_cache
  FOR ALL USING (true) WITH CHECK (true);


-- ─── FUNCAO: Limpar cache antigo ────────────────────────────
-- Executar periodicamente para remover cache com mais de 1 hora

CREATE OR REPLACE FUNCTION limpar_cache_antigo()
RETURNS void AS $$
BEGIN
  DELETE FROM relatorios_cache 
    WHERE updated_at < NOW() - INTERVAL '1 hour';
  
  DELETE FROM sessoes_cache 
    WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;


-- ─── TRIGGER: Auto-update do updated_at ─────────────────────

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_relatorios_cache_updated
  BEFORE UPDATE ON relatorios_cache
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();


-- ═══════════════════════════════════════════════════════════
-- NOTAS:
-- 1. Executar este script no SQL Editor do Supabase
-- 2. A funcao limpar_cache_antigo() pode ser agendada via
--    pg_cron ou chamada manualmente
-- 3. As politicas RLS estao abertas (publico). Em producao,
--    considerar restringir por authenticated role
-- ═══════════════════════════════════════════════════════════
