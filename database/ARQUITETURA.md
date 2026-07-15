# Análise Arquitetural - Aurora AVP

## 1. É Necessário Backend?

### RESPOSTA: SIM - Backend intermediário é ESSENCIAL

| Sem Backend (atual) | Com Backend |
|---------------------|-------------|
| ❌ CORS bloqueado (precisa proxy) | ✅ Sem CORS (server-to-server) |
| ❌ Credenciais expostas no JS | ✅ Credenciais seguras no server |
| ❌ Sessão PHP perdida entre requests | ✅ Sessão mantida server-side |
| ❌ 31k+ registros trafegam no browser | ✅ Pré-processamento no server |
| ❌ Rate limit da API sobrecarrega | ✅ Cache + throttle no backend |
| ❌ Sem histórico (API não armazena) | ✅ Banco próprio com histórico |

### Recomendação: Vercel API Routes + Supabase PostgreSQL

```
Browser (GitHub Pages)
    │
    ▼ (fetch JSON)
Vercel Serverless (/api/proxy.js) ← JÁ CRIADO
    │
    ├─▶ Supabase PostgreSQL (cache/histórico)
    │
    └─▶ aEasy API (dados frescos)
```

---

## 2. Virtualização de Dados

### Problema Atual
- `/vendas/listagem` retorna ~31.705 registros
- Cada registro tem 225 campos
- Volume: ~50MB+ de dados brutos por consulta completa
- Browser precisa filtrar client-side (lento)

### Solução: Virtualização em 3 níveis

#### Nível 1 - Paginação Server-Side (já implementado)
```
GET /api/vendas?page=1&limit=500
→ Server busca do aEasy com start=0&length=500
→ Retorna só os 500 primeiros
```

#### Nível 2 - Projeção de Campos (reduzir payload)
```
Dos 225 campos, o Dashboard usa apenas ~30.
Server filtra: retorna só campos necessários.
Redução: 225 → 30 campos = -87% do tráfego
```

#### Nível 3 - Agregação Server-Side
```
Em vez de enviar 31k registros ao browser:
Server calcula: { cotacoes: 450, vendas: 380, canceladas: 12, ... }
Retorna apenas o resultado agregado (1 objeto)
```

### Implementação Recomendada

```javascript
// Endpoint novo no backend
// GET /api/dashboard/indicadores?gestorId=xxx&de=2026-01-01&ate=2026-07-15

// Server faz:
// 1. Verifica cache (Supabase DB)
// 2. Se cache válido (< 5min): retorna do banco
// 3. Se cache expirado: busca do aEasy, processa, salva no banco, retorna

// Resposta: ~500 bytes (vs ~50MB raw)
{
  "indicadores": {
    "cotacoes": 1250,
    "vendas": 980,
    "canceladas": 45,
    "perdidas": 120,
    "taxaConversao": 78.4,
    "valorTotalVendido": 145820.50,
    "ticketMedio": 148.80
  },
  "ranking": [...top10...],
  "evolucao": [...12meses...]
}
```

---

## 3. Lazy Loading (Carregamento Preguiçoso)

### Estratégia de Carregamento

| Prioridade | Dados | Quando Carrega |
|------------|-------|----------------|
| P0 (imediato) | KPIs consolidados | Ao abrir a página |
| P1 (1-2s) | Ranking top 10 | Após KPIs |
| P2 (3-5s) | Gráfico evolução | Após ranking |
| P3 (sob demanda) | Lista detalhada | Ao clicar "Ver mais" |
| P4 (background) | Sincronização completa | A cada 5 minutos |

### Implementação

```javascript
// Carregamento em cascata (não bloqueia UI)
async function loadDashboard() {
    // P0 - Instantâneo (cache local ou servidor)
    renderKPIs(await getCachedKPIs());
    
    // P1 - Logo depois
    renderRanking(await getRanking());
    
    // P2 - Quando gráfico entrar no viewport
    const observer = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting) {
            renderChart(await getEvolucao());
            observer.disconnect();
        }
    });
    observer.observe(document.getElementById('chart-evolucao'));
    
    // P4 - Background sync
    scheduleSync();
}
```

---

## 4. Estratégia de Cache (Múltiplas Camadas)

### Camada 1 - Browser (localStorage)
```
TTL: 5 minutos
Dados: KPIs, ranking, evolução mensal
Tamanho: ~50KB
Propósito: Renderização instantânea no page load
```

### Camada 2 - Vercel Edge Cache
```
TTL: 60 segundos (stale-while-revalidate)
Dados: Respostas da API proxy
Headers: Cache-Control: s-maxage=60, stale-while-revalidate=300
Propósito: Reduzir cold starts e chamadas ao aEasy
```

### Camada 3 - Supabase PostgreSQL (persistente)
```
TTL: Indefinido (atualizado via sync)
Dados: Histórico completo, agregações pré-computadas
Propósito: Relatórios históricos, offline, comparações
```

### Camada 4 - Materialized Views (PostgreSQL)
```
Refresh: A cada 15 minutos (pg_cron)
Dados: mv_indicadores_consultor_mes, mv_ranking_gestores
Propósito: Queries complexas em <50ms
```

### Fluxo de Cache

```
Request → Browser Cache?
    ├─ HIT → Render (0ms)
    └─ MISS → Vercel Edge?
              ├─ HIT → Render (50ms)
              └─ MISS → Supabase DB?
                        ├─ HIT (fresh) → Render (100ms)
                        └─ STALE → Return stale + Background fetch aEasy
                                   └─ aEasy → Process → Save DB → Update caches
```

---

## 5. Sincronização com aEasy

### Sync Incremental (recomendado)

```
Frequência: A cada 5 minutos
Estratégia: Buscar apenas registros alterados desde último sync

1. Consultar sync_log → última sincronização
2. Buscar do aEasy com DataInicial = último sync
3. Upsert no PostgreSQL
4. Refresh materialized views
5. Invalidar caches (browser + edge)
```

### Sync Full (backup)
```
Frequência: 1x por dia (madrugada)
Estratégia: Rebuild completo de todas as tabelas
```

---

## 6. Arquitetura Final Recomendada

```
┌─────────────────────────────────────────────────────────────┐
│  FRONTEND (GitHub Pages / Vercel Static)                     │
│  - index.html (Dashboard)                                    │
│  - dashboard-comercial.js (renderização)                     │
│  - Cache Layer: localStorage (5min TTL)                      │
│  - Lazy loading por IntersectionObserver                     │
└─────────────────────┬───────────────────────────────────────┘
                      │ fetch JSON
                      ▼
┌─────────────────────────────────────────────────────────────┐
│  BACKEND (Vercel Serverless + Edge Cache)                    │
│  /api/proxy.js       → Proxy raw (já existe)                │
│  /api/indicadores.js → KPIs pré-calculados (NOVO)           │
│  /api/ranking.js     → Top vendedores (NOVO)                │
│  /api/sync.js        → Trigger de sincronização (NOVO)      │
│  Cache: stale-while-revalidate (60s)                        │
└─────────────────────┬───────────────────────────────────────┘
                      │
          ┌───────────┴───────────┐
          ▼                       ▼
┌───────────────────┐   ┌──────────────────────┐
│  Supabase DB      │   │  aEasy API           │
│  (PostgreSQL)     │   │  (fonte primária)    │
│  - vendas         │   │  POST /vendas/list   │
│  - consultores    │   │  GET /consultores    │
│  - faturas        │   │  POST /fluxo-caixa   │
│  - mv_indicadores │   │  GET /eventos        │
│  - sync_log       │   │                      │
└───────────────────┘   └──────────────────────┘
```

---

## 7. Próximos Passos

1. **Executar schema.sql** no Supabase (SQL Editor)
2. **Criar /api/sync.js** (sincronização aEasy → PostgreSQL)
3. **Criar /api/indicadores.js** (lê do banco, não da API)
4. **Atualizar dashboard-comercial.js** para chamar /api/indicadores
5. **Configurar pg_cron** para refresh das materialized views
6. **Adicionar localStorage cache** no frontend

### Benefícios após implementação:
- Dashboard carrega em **<500ms** (vs 5-15s atual)
- Sem dependência de CORS/proxy para dados históricos
- Credenciais **não expostas** no browser
- Histórico completo para análise de tendências
- Funciona offline (dados em cache)
