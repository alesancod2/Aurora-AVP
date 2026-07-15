-- ============================================
-- Aurora AVP - Migration 002
-- Cache de relatórios, gestores ocultos, sessões
-- 
-- Executar em: Supabase SQL Editor
-- Projeto: zjacembodtjrkynfmtxf
-- ============================================

-- ========= HELPER FUNCTIONS (bypass RLS) =========
CREATE OR REPLACE FUNCTION public.is_authenticated()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN auth.role() = 'authenticated';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================
-- 1. CACHE DE RELATÓRIOS (evita re-buscar dados do aEasy)
-- ============================================
CREATE TABLE IF NOT EXISTS public.relatorios_cache (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    filtro_hash TEXT NOT NULL UNIQUE,
    tipo_relatorio TEXT NOT NULL DEFAULT 'dashboard',
    -- Metadados do filtro
    data_inicial DATE,
    data_final DATE,
    gestor_id TEXT,
    regional TEXT,
    -- Dados cacheados (JSONB para flexibilidade)
    dados JSONB NOT NULL,
    total_registros INTEGER DEFAULT 0,
    -- Controle
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '15 minutes'),
    created_by TEXT
);

CREATE INDEX idx_cache_hash ON public.relatorios_cache(filtro_hash);
CREATE INDEX idx_cache_expires ON public.relatorios_cache(expires_at);
CREATE INDEX idx_cache_tipo ON public.relatorios_cache(tipo_relatorio);

-- RLS
ALTER TABLE public.relatorios_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cache_select" ON public.relatorios_cache FOR SELECT USING (true);
CREATE POLICY "cache_insert" ON public.relatorios_cache FOR INSERT WITH CHECK (true);
CREATE POLICY "cache_update" ON public.relatorios_cache FOR UPDATE USING (true);
CREATE POLICY "cache_delete" ON public.relatorios_cache FOR DELETE USING (true);

-- Function: limpar cache expirado (chamar via cron ou manualmente)
CREATE OR REPLACE FUNCTION public.limpar_cache_expirado()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM public.relatorios_cache WHERE expires_at < NOW();
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================
-- 2. GESTORES OCULTOS (preferência do usuário)
-- ============================================
CREATE TABLE IF NOT EXISTS public.gestores_ocultos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    usuario_id TEXT NOT NULL,
    gestor_id TEXT NOT NULL,
    gestor_nome TEXT NOT NULL,
    motivo TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(usuario_id, gestor_id)
);

CREATE INDEX idx_gestores_ocultos_usuario ON public.gestores_ocultos(usuario_id);

-- RLS
ALTER TABLE public.gestores_ocultos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gestores_ocultos_select" ON public.gestores_ocultos FOR SELECT USING (true);
CREATE POLICY "gestores_ocultos_insert" ON public.gestores_ocultos FOR INSERT WITH CHECK (true);
CREATE POLICY "gestores_ocultos_delete" ON public.gestores_ocultos FOR DELETE USING (true);


-- ============================================
-- 3. SESSÕES DE USUÁRIO (controle de sessão única)
-- ============================================
CREATE TABLE IF NOT EXISTS public.user_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    usuario_id TEXT NOT NULL,
    session_token TEXT NOT NULL UNIQUE,
    device_info TEXT,
    ip_address TEXT,
    ativo BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_seen TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '24 hours')
);

CREATE INDEX idx_sessions_usuario ON public.user_sessions(usuario_id, ativo);
CREATE INDEX idx_sessions_token ON public.user_sessions(session_token);
CREATE INDEX idx_sessions_expires ON public.user_sessions(expires_at);

-- RLS
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sessions_select" ON public.user_sessions FOR SELECT USING (true);
CREATE POLICY "sessions_insert" ON public.user_sessions FOR INSERT WITH CHECK (true);
CREATE POLICY "sessions_update" ON public.user_sessions FOR UPDATE USING (true);
CREATE POLICY "sessions_delete" ON public.user_sessions FOR DELETE USING (true);

-- Function: invalidar sessões anteriores no login
CREATE OR REPLACE FUNCTION public.invalidar_sessoes_login(
    p_usuario_id TEXT,
    p_novo_token TEXT,
    p_device TEXT DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
    -- Desativar sessões anteriores
    UPDATE public.user_sessions
    SET ativo = false
    WHERE usuario_id = p_usuario_id AND ativo = true;
    
    -- Criar nova sessão
    INSERT INTO public.user_sessions (usuario_id, session_token, device_info, ativo)
    VALUES (p_usuario_id, p_novo_token, p_device, true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: verificar se sessão é válida
CREATE OR REPLACE FUNCTION public.verificar_sessao(
    p_usuario_id TEXT,
    p_token TEXT
)
RETURNS BOOLEAN AS $$
BEGIN
    -- Atualizar last_seen
    UPDATE public.user_sessions
    SET last_seen = NOW()
    WHERE usuario_id = p_usuario_id AND session_token = p_token AND ativo = true;
    
    RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: limpar sessões expiradas
CREATE OR REPLACE FUNCTION public.limpar_sessoes_expiradas()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM public.user_sessions WHERE expires_at < NOW() OR (ativo = false AND created_at < NOW() - INTERVAL '7 days');
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================
-- 4. TRIGGER: updated_at automático
-- ============================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_cache_updated
    BEFORE UPDATE ON public.relatorios_cache
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
