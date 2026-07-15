# Scripts de Importação - Aurora AVP

## import-full.mjs

Script Node.js para importação completa dos dados do aEasy para o Supabase PostgreSQL.

### Requisitos

- Node.js 18+ (usa `fetch` nativo)
- Acesso à internet (aEasy + Supabase)

### Uso

```bash
# Importar TUDO (consultores + vendas)
node scripts/import-full.mjs

# Apenas consultores (~5.9k registros, ~30s)
node scripts/import-full.mjs --target consultores

# Apenas vendas (~31k registros, ~5-10min)
node scripts/import-full.mjs --target vendas

# Continuar de onde parou (offset)
node scripts/import-full.mjs --target vendas --offset 15000

# Lotes menores (conexão instável)
node scripts/import-full.mjs --batch-size 200
```

### Estratégia Anti-Timeout

| Mecanismo | Descrição |
|-----------|-----------|
| Paginação | Busca 500 registros por vez do aEasy |
| Upsert chunks | Insere 200 registros por vez no Supabase |
| Delay entre lotes | 1s entre buscas (evita rate limit) |
| Retry automático | 3 tentativas por operação com backoff |
| Resumable | Usar `--offset` para continuar se falhar |
| Progress bar | Visual de progresso no terminal |

### Tempo Estimado

| Target | Registros | Tempo |
|--------|-----------|-------|
| Consultores | ~5.918 | 30-60s |
| Vendas | ~31.705 | 5-15min |
| Total | ~37.623 | 6-16min |

### Fluxo

```
1. Login no aEasy (cookie PHPSESSID)
2. Buscar lote de 500 registros (DataTables API)
3. Mapear campos aEasy → schema PostgreSQL
4. Upsert em chunks de 200 no Supabase (REST API)
5. Repetir até buscar todos os registros
6. Registrar no sync_log
```

---

## Edge Function: import-data

Alternativa serverless para importações incrementais (chamada por cron).

### Deploy

```bash
supabase functions deploy import-data --no-verify-jwt
```

### Uso

```bash
# Via curl
curl -X POST https://zjacembodtjrkynfmtxf.supabase.co/functions/v1/import-data \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -d '{"target": "all", "batch_size": 500, "max_batches": 10}'

# Só consultores
curl -X POST .../import-data -d '{"target": "consultores"}'

# Vendas a partir do offset 5000
curl -X POST .../import-data -d '{"target": "vendas", "offset": 5000}'
```

### Limitações Edge Function

- Timeout: 60s (processa ~5 lotes por execução)
- Para importação completa, chamar múltiplas vezes com offset crescente
- Ou usar o script Node.js local (sem timeout)
