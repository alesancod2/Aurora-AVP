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


def buscar_fluxo(sess, di, df, tipo_data="FaturasDataVencimento", page=1, length=500):
    """Busca fluxo de caixa da API AEasy"""
    data = f"page={page}&length={length}&DataInicial={di}&DataFinal={df}&TipoData={tipo_data}"
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

    # 2. Buscar fluxo de caixa (Vencimento)
    print("2. Buscando fluxo de caixa (Data Vencimento)...")
    res = buscar_fluxo(SESS, di, df, "FaturasDataVencimento", 1, 500)
    if not res or res.get('code') != 200:
        print(f"   FALHA: {json.dumps(res)[:200] if res else 'sem resposta'}")
        exit(1)

    totais = res.get('totais', {})
    dados = res.get('dados', [])
    print(f"   Totais: ValorTotal={totais.get('ValorTotal', 0)}, Qtd={totais.get('Quantidade', 0)}")
    print(f"   Faturas retornadas: {len(dados)}")

    # 3. Salvar no cache (limitar a 200 faturas para nao estourar o DB)
    print("3. Salvando no DB...")
    hash_key = f"fluxo|{di}|{df}|FaturasDataVencimento|"
    # Guardar totais completos + primeiras 200 faturas (para exibicao)
    cache_data = {'totais': totais, 'dados': dados[:200], 'total_faturas': len(dados)}
    status = save_to_db(hash_key, di, df, cache_data)

    print(f"\n=== CONCLUIDO ===")
    print(f"Faturas: {len(dados)}")
    print(f"ValorTotal: R$ {totais.get('ValorTotal', 0):,.2f}")
    print(f"ValorPago: R$ {totais.get('ValorPago', 0):,.2f}")
    print(f"DB status: {status}")


if __name__ == "__main__":
    run()
