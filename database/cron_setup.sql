-- ═══════════════════════════════════════════════════════════
-- Aurora AVP - Configuracao do Cron (Supabase)
-- Importacao automatica de dados a cada 1 hora
-- ═══════════════════════════════════════════════════════════

-- 1. Habilitar extensoes necessarias
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 2. Agendar importacao a cada 1 hora (mês atual)
-- O Cron chama a Edge Function que busca dados da API e salva no DB
SELECT cron.schedule(
  'importar-mes-atual-1h',
  '0 * * * *',  -- A cada hora, no minuto 0
  $$
  SELECT net.http_post(
    url := 'https://zjacembodtjrkynfmtxf.supabase.co/functions/v1/aeasy-proxy',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpqYWNlbWJvZHRqcmt5bmZtdHhmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQxMTc3NTEsImV4cCI6MjA5OTY5Mzc1MX0.8q7I5cTcNVyL7uLXgZ1ZWCE3T1KbfYyevnr8uqLFVvY'
    ),
    body := jsonb_build_object(
      'action', 'importar-cache',
      'tipo_data', '2',
      'data_inicial', to_char(date_trunc('month', CURRENT_DATE), 'YYYY-MM-DD'),
      'data_final', to_char(CURRENT_DATE, 'YYYY-MM-DD'),
      'ordenar', '3',
      'retornar_lider', 'NAO'
    )
  );
  $$
);

-- 3. Verificar crons agendados
SELECT * FROM cron.job;

-- ═══════════════════════════════════════════════════════════
-- COMANDOS UTEIS:
--
-- Ver crons ativos:
--   SELECT * FROM cron.job;
--
-- Ver historico de execucoes:
--   SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;
--
-- Remover um cron:
--   SELECT cron.unschedule('importar-mes-atual-1h');
--
-- Pausar temporariamente:
--   UPDATE cron.job SET active = false WHERE jobname = 'importar-mes-atual-1h';
--
-- Reativar:
--   UPDATE cron.job SET active = true WHERE jobname = 'importar-mes-atual-1h';
-- ═══════════════════════════════════════════════════════════
