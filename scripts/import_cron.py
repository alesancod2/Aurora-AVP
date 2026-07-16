#!/usr/bin/env python3
"""
Importacao automatica do mes atual para o Supabase DB.
Executado pelo GitHub Actions a cada hora.

Variaveis de ambiente necessarias:
  AEASY_CPF, AEASY_SENHA, SUPABASE_URL, SUPABASE_KEY
"""
import json, subprocess, re, time, urllib.request, os
from datetime import datetime, timedelta

# Configuracao via env vars
BASE = "https://aeasy.autovaleprevencoes.org"
SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://zjacembodtjrkynfmtxf.supabase.co")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "")
AEASY_CPF = os.environ.get("AEASY_CPF", "")
AEASY_SENHA = os.environ.get("AEASY_SENHA", "")

if not SUPABASE_KEY or not AEASY_CPF or not AEASY_SENHA:
    print("ERRO: Variaveis de ambiente nao configuradas")
    print(f"  SUPABASE_KEY: {'OK' if SUPABASE_KEY else 'FALTA'}")
    print(f"  AEASY_CPF: {'OK' if AEASY_CPF else 'FALTA'}")
    print(f"  AEASY_SENHA: {'OK' if AEASY_SENHA else 'FALTA'}")
    exit(1)


def login():
    result = subprocess.run([
        'curl', '-s', '-D', '-', '-X', 'POST', f'{BASE}/conta/login',
        '-H', 'Content-Type: application/json',
        '-d', json.dumps({"UsuariosLogin": AEASY_CPF, "UsuariosSenha": AEASY_SENHA})
    ], capture_output=True, text=True)
    match = re.search(r'PHPSESSID=([^;]+)', result.stdout)
    return f"PHPSESSID={match.group(1)}" if match else None


def parse_html_table(html):
    start = html.find('<tbody>')
    end = html.find('</tbody>')
    if start == -1:
        return []
    tbody = html[start:end]
    rows = re.findall(r'<tr>(.*?)</tr>', tbody, re.DOTALL)
    gestores = []
    for row in rows:
        cells = re.findall(r'<td[^>]*>(.*?)</td>', row, re.DOTALL)
        cells = [re.sub(r'<[^>]+>', '', c).strip() for c in cells]
        if len(cells) < 20:
            continue
        nome = cells[1]
        if not nome or nome in ('Total', 'Totais'):
            continue

        def pn(s):
            return int(re.sub(r'[^\d]', '', s) or '0')

        def pm(s):
            s = re.sub(r'R\$\s*', '', s).strip().replace('.', '').replace(',', '.')
            try:
                return float(s)
            except:
                return 0.0

        gestores.append({
            'gestor': nome, 'cidade': cells[2], 'taxa_conversao': cells[3],
            'cot_qtd': pn(cells[4]), 'cot_valor': pm(cells[5]),
            'ati_qtd': pn(cells[13]), 'ati_valor': pm(cells[14]), 'ati_ticket': pm(cells[15]),
            'sus_qtd': pn(cells[16]), 'can_qtd': pn(cells[19]),
            'pbp_qtd': pn(cells[22]), 'pbp_valor': pm(cells[23]),
            'equipe': []
        })
    return gestores


def save_to_db(hash_key, di, df, gestores):
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
        "tipo_relatorio": "dashboard",
        "data_inicial": di,
        "data_final": df,
        "dados": gestores,
        "total_registros": len(gestores),
        "updated_at": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%S+00:00"),
        "expires_at": "2099-12-31T23:59:59+00:00"
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

    print(f"=== Importacao Automatica ===")
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

    # 2. Buscar lideres
    print("2. Buscando lideres...")
    url = (f"{BASE}/consultores/listagem?draw=1&start=0&length=5000"
           f"&columns%5B0%5D%5Bdata%5D=IndividuosNome&columns%5B0%5D%5Bname%5D=IndividuosNome"
           f"&columns%5B0%5D%5Borderable%5D=true&columns%5B0%5D%5Bsearchable%5D=false"
           f"&order%5B0%5D%5Bcolumn%5D=0&order%5B0%5D%5Bdir%5D=asc"
           f"&formPesquisa%5BsubmitFilter%5D=true&formPesquisa%5BSituacao%5D%5B%5D=2"
           f"&formPesquisa%5BTipoConsultor%5D=5")
    result = subprocess.run([
        'curl', '-s', '-b', SESS, '--max-time', '60', url,
        '-H', 'X-Requested-With: XMLHttpRequest'
    ], capture_output=True, text=True)
    lideres = [
        {'id': r['ConsultoresId'], 'nome': r['IndividuosNome'].strip()}
        for r in json.loads(result.stdout).get('data', [])
        if str(r.get('ConsultoresLider', '0')) == '1'
    ]
    lider_nomes = [l['nome'].upper() for l in lideres]
    print(f"   {len(lideres)} lideres encontrados")

    # 3. Buscar TopVendas geral
    print("3. Buscando TopVendas...")
    url = (f"{BASE}/TopVendas?TipoData=2&DataInicial={di}&DataFinal={df}"
           f"&ConsultoresId=&EquipeId=&Ordenar=3&CampoOrder=Quantidade"
           f"&CentrodeCusto=&RetornarLiderComEquipe=NAO")
    result = subprocess.run([
        'curl', '-s', '-b', SESS, '--max-time', '60', url,
        '-H', 'Accept: text/html'
    ], capture_output=True, text=True)
    all_gestores = parse_html_table(result.stdout)
    gestores = [g for g in all_gestores if g['gestor'].upper() in lider_nomes]
    print(f"   {len(all_gestores)} total, {len(gestores)} lideres")

    # 4. Buscar equipes (apenas lideres com cotacoes > 0, paralelo 5)
    lideres_ativos = [g for g in gestores if g['cot_qtd'] > 0]
    print(f"4. Buscando equipes de {len(lideres_ativos)} lideres com cotacoes...")

    sess_count = 0
    for i, gd in enumerate(lideres_ativos):
        sess_count += 1
        if sess_count > 15:
            SESS = login()
            sess_count = 0

        lider = next((l for l in lideres if l['nome'].upper() == gd['gestor'].upper()), None)
        if not lider:
            continue

        url = (f"{BASE}/TopVendas?TipoData=2&DataInicial={di}&DataFinal={df}"
               f"&ConsultoresId=&EquipeId={lider['id']}&Ordenar=3&CampoOrder=Quantidade"
               f"&CentrodeCusto=&RetornarLiderComEquipe=NAO")
        result = subprocess.run([
            'curl', '-s', '-b', SESS, '--max-time', '30', url,
            '-H', 'Accept: text/html'
        ], capture_output=True, text=True)
        membros = parse_html_table(result.stdout)
        membros = [m for m in membros if m['gestor'].upper() != gd['gestor'].upper() and m['cot_qtd'] >= 1]
        gd['equipe'] = membros
        time.sleep(0.2)

    # 5. Salvar no DB
    print("5. Salvando no DB...")
    hash_key = f"campo_order=Quantidade|centro_custo=|data_final={df}|data_inicial={di}|ordenar=3|retornar_lider=NAO|tipo_data=2"
    status = save_to_db(hash_key, di, df, gestores)
    total_membros = sum(len(g.get('equipe', [])) for g in gestores)

    print(f"\n=== CONCLUIDO ===")
    print(f"Gestores: {len(gestores)}")
    print(f"Com cotacoes: {len(lideres_ativos)}")
    print(f"Total membros: {total_membros}")
    print(f"DB status: {status}")
    print(f"Hash: {hash_key}")


if __name__ == "__main__":
    run()
