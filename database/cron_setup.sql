-- ═══════════════════════════════════════════════════════════
-- Aurora AVP - Configuracao do Cron (Supabase)
-- Importacao automatica em 4 etapas a cada hora
-- ═══════════════════════════════════════════════════════════

-- 1. Habilitar extensoes necessarias
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 2. Remover crons antigos (se existirem)
SELECT cron.unschedule('importar-mes-atual-1h');
SELECT cron.unschedule('importar-etapa-1');
SELECT cron.unschedule('importar-etapa-2');
SELECT cron.unschedule('importar-etapa-3');
SELECT cron.unschedule('importar-etapa-4');

-- 3. Agendar 4 etapas com intervalos de 2 minutos
-- Etapa 1: minuto 0 - Busca dados gerais (~5s)
SELECT cron.schedule(
  'importar-etapa-1',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://zjacembodtjrkynfmtxf.supabase.co/functions/v1/aeasy-proxy',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpqYWNlbWJvZHRqcmt5bmZtdHhmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQxMTc3NTEsImV4cCI6MjA5OTY5Mzc1MX0.8q7I5cTcNVyL7uLXgZ1ZWCE3T1KbfYyevnr8uqLFVvY'
    ),
    body := jsonb_build_object(
      'action', 'importar-cache',
      'etapa', '1',
      'data_inicial', to_char(date_trunc('month', CURRENT_DATE), 'YYYY-MM-DD'),
      'data_final', to_char(CURRENT_DATE, 'YYYY-MM-DD')
    )
  );
  $$
);

-- Etapa 2: minuto 2 - Equipes lote 1/3 (~15s)
SELECT cron.schedule(
  'importar-etapa-2',
  '2 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://zjacembodtjrkynfmtxf.supabase.co/functions/v1/aeasy-proxy',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpqYWNlbWJvZHRqcmt5bmZtdHhmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQxMTc3NTEsImV4cCI6MjA5OTY5Mzc1MX0.8q7I5cTcNVyL7uLXgZ1ZWCE3T1KbfYyevnr8uqLFVvY'
    ),
    body := jsonb_build_object(
      'action', 'importar-cache',
      'etapa', '2',
      'data_inicial', to_char(date_trunc('month', CURRENT_DATE), 'YYYY-MM-DD'),
      'data_final', to_char(CURRENT_DATE, 'YYYY-MM-DD')
    )
  );
  $$
);

-- Etapa 3: minuto 4 - Equipes lote 2/3 (~15s)
SELECT cron.schedule(
  'importar-etapa-3',
  '4 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://zjacembodtjrkynfmtxf.supabase.co/functions/v1/aeasy-proxy',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpqYWNlbWJvZHRqcmt5bmZtdHhmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQxMTc3NTEsImV4cCI6MjA5OTY5Mzc1MX0.8q7I5cTcNVyL7uLXgZ1ZWCE3T1KbfYyevnr8uqLFVvY'
    ),
    body := jsonb_build_object(
      'action', 'importar-cache',
      'etapa', '3',
      'data_inicial', to_char(date_trunc('month', CURRENT_DATE), 'YYYY-MM-DD'),
      'data_final', to_char(CURRENT_DATE, 'YYYY-MM-DD')
    )
  );
  $$
);

-- Etapa 4: minuto 6 - Equipes lote 3/3 (~15s)
SELECT cron.schedule(
  'importar-etapa-4',
  '6 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://zjacembodtjrkynfmtxf.supabase.co/functions/v1/aeasy-proxy',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpqYWNlbWJvZHRqcmt5bmZtdHhmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQxMTc3NTEsImV4cCI6MjA5OTY5Mzc1MX0.8q7I5cTcNVyL7uLXgZ1ZWCE3T1KbfYyevnr8uqLFVvY'
    ),
    body := jsonb_build_object(
      'action', 'importar-cache',
      'etapa', '4',
      'data_inicial', to_char(date_trunc('month', CURRENT_DATE), 'YYYY-MM-DD'),
      'data_final', to_char(CURRENT_DATE, 'YYYY-MM-DD')
    )
  );
  $$
);

-- 4. Verificar crons agendados
SELECT * FROM cron.job;

-- ═══════════════════════════════════════════════════════════
-- TIMELINE (a cada hora):
--   XX:00 - Etapa 1: Busca TopVendas + lideres, salva base (~5s)
--   XX:02 - Etapa 2: Equipes lote 1/3 (~15s)
--   XX:04 - Etapa 3: Equipes lote 2/3 (~15s)
--   XX:06 - Etapa 4: Equipes lote 3/3 (~15s)
--   XX:07 - COMPLETO: cache atualizado com todos os dados
--
-- COMANDOS UTEIS:
--   Ver crons: SELECT * FROM cron.job;
--   Ver execucoes: SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;
--   Remover todos: SELECT cron.unschedule(jobname) FROM cron.job;
--   Testar resposta: SELECT * FROM net._http_response ORDER BY created DESC LIMIT 4;
-- ═══════════════════════════════════════════════════════════
