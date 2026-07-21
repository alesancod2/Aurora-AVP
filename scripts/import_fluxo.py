#!/usr/bin/env python3
"""
Importacao automatica do fluxo de caixa (mes atual) para o Supabase DB.
Executado pelo GitHub Actions a cada hora junto com import_cron.py.

Variaveis de ambiente necessarias:
  AEASY_CPF, AEASY_SENHA, SUPABASE_URL, SUPABASE_KEY
"""
import json, subprocess, re, urllib.request, urllib.parse, os
from datetime import datetime

# Configuracao via env vars
BASE = "https://aeasy.autovaleprevencoes.org"
SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://zjacembodtjrkynfmtxf.supabase.co")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "")
AEASY_CPF = os.environ.get("AEASY_CPF", "")
AEASY_SENHA = os.environ.get("AEASY_SENHA", "")

if not SUPABASE_KEY or not AEASY_CPF or not AEASY_SENHA:
    print("ERRO: Variaveis de ambiente nao configuradas")
    exit(1)


def login():
    result = subprocess.run([
        'curl', '-s', '-D', '-', '-X', 'POST', f'{BASE}/conta/login',
        '-H', 'Content-Type: application/json',
        '-d', json.dumps({"UsuariosLogin": AEASY_CPF, "UsuariosSenha": AEASY_SENHA})
    ], capture_output=True, text=True)
    match = re.search(r'PHPSESSID=([^;]+)', result.stdout)
    return f"PHPSESSID={match.group(1)}" if match else None


def buscar_fluxo(sess, di, df, tipo_data="FaturasDataVencimento", page=1, length=500, vencimento=None):
    """Busca fluxo de caixa da API AEasy"""
    data = f"page={page}&length={length}&DataInicial={di}&DataFinal={df}&TipoData={tipo_data}"
    if vencimento:
        for v in (vencimento if isinstance(vencimento, list) else [vencimento]):
            data += f"&VendasVencimento%5B%5D={v}"
    result = subprocess.run([
        'curl', '-s', '-b', sess, '--max-time', '120',
        '-X', 'POST', f'{BASE}/fluxo-caixa/buscar-pagina',
        '-H', 'Content-Type: application/x-www-form-urlencoded',
        '-H', 'X-Requested-With: XMLHttpRequest',
        '-d', data
    ], capture_output=True, text=True)
    try:
        return json.loads(result.stdout)
    except:
        print(f"  Erro ao parsear resposta: {result.stdout[:200]}")
        return None


def save_to_db(hash_key, di, df, cache_data):
    """Salva fluxo de caixa no cache do Supabase"""
    # Deletar existente
    req_del = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/relatorios_cache?filtro_hash=eq.{urllib.parse.quote(hash_key)}",
        headers={'apikey': SUPABASE_KEY, 'Authorization': f'Bearer {SUPABASE_KEY}'},
        method='DELETE'
    )
    try:
        urllib.request.urlopen(req_del)
    except:
        pass

    # Inserir novo
    payload = json.dumps({
        "filtro_hash": hash_key,
        "tipo_relatorio": "fluxo-caixa",
        "data_inicial": di,
        "data_final": df,
        "dados": cache_data,
        "total_registros": len(cache_data.get('dados', [])),
        "updated_at": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%S+00:00"),
        "expires_at": (datetime.utcnow().replace(hour=23, minute=59, second=59)).strftime("%Y-%m-%dT%H:%M:%S+00:00")
    }).encode('utf-8')

    req = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/relatorios_cache",
        data=payload,
        headers={
            'apikey': SUPABASE_KEY,
            'Authorization': f'Bearer {SUPABASE_KEY}',
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal'
        },
        method='POST'
    )
    try:
        resp = urllib.request.urlopen(req)
        return resp.status
    except urllib.error.HTTPError as e:
        print(f"  DB Erro {e.code}: {e.read().decode()[:100]}")
        return e.code


def run():
    hoje = datetime.now()
    di = hoje.replace(day=1).strftime('%Y-%m-%d')
    df = hoje.strftime('%Y-%m-%d')
    mes = hoje.strftime('%m')
    ano = hoje.strftime('%Y')

    print(f"=== Importacao Fluxo de Caixa ===")
    print(f"Periodo: {di} a {df}")
    print(f"Hora: {hoje.strftime('%Y-%m-%d %H:%M:%S')}")
    print()

    # 1. Login
    print("1. Login...")
    SESS = login()
    if not SESS:
        print("   FALHA no login")
        exit(1)
    print(f"   OK")

    # 2. Buscar totais gerais do mes
    print("2. Buscando totais gerais...")
    res_geral = buscar_fluxo(SESS, di, df, "FaturasDataVencimento", 1, 1)
    if not res_geral or res_geral.get('code') != 200:
        print(f"   FALHA: {json.dumps(res_geral)[:200] if res_geral else 'sem resposta'}")
        exit(1)
    totais_gerais = res_geral.get('totais', {})
    print(f"   ValorTotal={totais_gerais.get('ValorTotal', 0)}, Qtd={totais_gerais.get('Quantidade', 0)}")

    # 3. Buscar por cada dia de vencimento (05, 10, 15, 20, 25, 30)
    print("3. Buscando por vencimento...")
    dias_vencimento = [5, 10, 15, 20, 25, 30]
    vencimentos = {}

    import time
    for dia in dias_vencimento:
        print(f"   Vencimento {dia:02d}...")
        res = buscar_fluxo(SESS, di, df, "FaturasDataVencimento", 1, 1, vencimento=dia)
        if res and res.get('code') == 200:
            t = res.get('totais', {})
            vencimentos[f"{dia:02d}"] = {
                'total': t.get('ValorTotal', 0),
                'pago': t.get('ValorPago', 0),
                'aberto': t.get('ValorAberto', 0),
                'cancelado': t.get('ValorCancelado', 0),
                'qtd': t.get('Quantidade', 0)
            }
            print(f"     Total={t.get('ValorTotal',0):.2f}, Qtd={t.get('Quantidade',0)}")
        else:
            vencimentos[f"{dia:02d}"] = {'total': 0, 'pago': 0, 'aberto': 0, 'cancelado': 0, 'qtd': 0}
            print(f"     Sem dados")
        time.sleep(0.5)

    # 4. Salvar no cache (dados agrupados por vencimento - JSON pequeno)
    print("4. Salvando no DB...")
    # Usar o ultimo dia do mes como data_final no hash
    import calendar
    last_day = calendar.monthrange(int(ano), int(mes))[1]
    df_full = f"{ano}-{mes}-{last_day:02d}"
    hash_key = f"fluxo|{di}|{df_full}|FaturasDataVencimento|"

    cache_data = {
        'totais': totais_gerais,
        'vencimentos': vencimentos,
        'dados': []  # Nao guardamos faturas individuais
    }
    status = save_to_db(hash_key, di, df_full, cache_data)

    print(f"\n=== CONCLUIDO ===")
    print(f"ValorTotal: R$ {totais_gerais.get('ValorTotal', 0):,.2f}")
    print(f"ValorPago: R$ {totais_gerais.get('ValorPago', 0):,.2f}")
    print(f"Vencimentos: {len(vencimentos)} dias")
    for d, v in sorted(vencimentos.items()):
        print(f"  Dia {d}: Total={v['total']:.2f}, Pago={v['pago']:.2f}, Aberto={v['aberto']:.2f}, Qtd={v['qtd']}")
    print(f"DB status: {status}")


if __name__ == "__main__":
    run()
