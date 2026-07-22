#!/usr/bin/env python3
"""
Importacao automatica do fluxo de caixa (mes atual) para o Supabase DB.
Executado pelo GitHub Actions a cada hora junto com import_cron.py.

Variaveis de ambiente necessarias:
  AEASY_CPF, AEASY_SENHA, SUPABASE_URL, SUPABASE_KEY
"""
import json, subprocess, re, urllib.request, urllib.parse, os, time, calendar
from datetime import datetime

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


def login(tentativas=3):
    """Login com retry"""
    for i in range(tentativas):
        try:
            result = subprocess.run([
                'curl', '-s', '-D', '-', '-X', 'POST', f'{BASE}/conta/login',
                '-H', 'Content-Type: application/json',
                '--max-time', '30',
                '-d', json.dumps({"UsuariosLogin": AEASY_CPF, "UsuariosSenha": AEASY_SENHA})
            ], capture_output=True, text=True, timeout=35)
            match = re.search(r'PHPSESSID=([^;]+)', result.stdout)
            if match:
                return f"PHPSESSID={match.group(1)}"
            print(f"  Login tentativa {i+1}: sem cookie")
        except Exception as e:
            print(f"  Login tentativa {i+1} erro: {e}")
        if i < tentativas - 1:
            time.sleep(3)
    return None


def buscar_fluxo(sess, di, df, tipo_data="FaturasDataVencimento", vencimento=None, tentativas=3, pagina=1):
    """Busca totais do fluxo de caixa usando parametros corretos (HAR)"""
    # Parametros no formato correto da API AEasy (confirmado via HAR)
    params = (
        f"OrdenarPor=FaturasDataVencimento"
        f"&TipoData={tipo_data}"
        f"&DataInicial={di}"
        f"&DataFinal={df}"
        f"&Nome=&NomeFantasia=&Placa=&GruposConsultoresId="
        f"&TipoBaixa=&FaturasTipo=&FormaCobranca=&FaturasParcela="
        f"&estadosIddhidden=&cidadesIddhidden="
        f"&RetornarLiderComEquipe=&FaturasNumeroFaturaBoleto="
        f"&pagina={pagina}&quantidadeLista=200"
    )
    if vencimento is not None:
        params += f"&VendasVencimento%5B%5D={vencimento}"

    for i in range(tentativas):
        try:
            result = subprocess.run([
                'curl', '-s', '-b', sess, '--max-time', '180',
                '-X', 'POST', f'{BASE}/fluxo-caixa/buscar-pagina/',
                '-H', 'Content-Type: application/x-www-form-urlencoded; charset=UTF-8',
                '-H', 'X-Requested-With: XMLHttpRequest',
                '-H', f'Referer: {BASE}/fluxo-caixa',
                '-H', 'Accept: application/json, text/javascript, */*; q=0.01',
                '-d', params
            ], capture_output=True, text=True, timeout=185)

            if result.stdout and result.stdout.strip():
                parsed = json.loads(result.stdout)
                if parsed.get('code') == 200:
                    return parsed
                print(f"  Resposta invalida (code={parsed.get('code')}): {result.stdout[:100]}")
            else:
                print(f"  Tentativa {i+1}: resposta vazia")
        except json.JSONDecodeError:
            print(f"  Tentativa {i+1}: JSON invalido: {result.stdout[:100]}")
        except subprocess.TimeoutExpired:
            print(f"  Tentativa {i+1}: timeout (>185s)")
        except Exception as e:
            print(f"  Tentativa {i+1} erro: {e}")

        if i < tentativas - 1:
            print(f"  Aguardando 5s antes de tentar novamente...")
            time.sleep(5)

    return None


def save_to_db(hash_key, di, df, cache_data):
    """Salva fluxo de caixa no cache do Supabase"""
    # Deletar existente
    try:
        req_del = urllib.request.Request(
            f"{SUPABASE_URL}/rest/v1/relatorios_cache?filtro_hash=eq.{urllib.parse.quote(hash_key)}",
            headers={'apikey': SUPABASE_KEY, 'Authorization': f'Bearer {SUPABASE_KEY}'},
            method='DELETE'
        )
        urllib.request.urlopen(req_del)
    except Exception as e:
        print(f"  Aviso ao deletar: {e}")

    # Inserir novo
    payload = json.dumps({
        "filtro_hash": hash_key,
        "tipo_relatorio": "fluxo-caixa",
        "data_inicial": di,
        "data_final": df,
        "dados": cache_data,
        "total_registros": int(cache_data.get('totais', {}).get('Quantidade', 0)),
        "updated_at": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%S+00:00"),
        "expires_at": (datetime.utcnow().replace(hour=23, minute=59, second=59)).strftime("%Y-%m-%dT%H:%M:%S+00:00")
    }).encode('utf-8')

    try:
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
        resp = urllib.request.urlopen(req)
        return resp.status
    except urllib.error.HTTPError as e:
        print(f"  DB Erro {e.code}: {e.read().decode()[:200]}")
        return e.code


def run():
    hoje = datetime.now()
    di = hoje.replace(day=1).strftime('%Y-%m-%d')
    mes = hoje.strftime('%m')
    ano = hoje.strftime('%Y')
    last_day = calendar.monthrange(int(ano), int(mes))[1]
    df_full = f"{ano}-{mes}-{last_day:02d}"

    print(f"=== Importacao Fluxo de Caixa ===")
    print(f"Periodo: {di} a {df_full}")
    print(f"Hora: {hoje.strftime('%Y-%m-%d %H:%M:%S')}")
    print()

    # 1. Login
    print("1. Login...")
    SESS = login()
    if not SESS:
        print("   FALHA no login - abortando fluxo de caixa (nao bloqueia workflow)")
        exit(0)  # exit(0) = nao falha o workflow
    print(f"   OK")

    # 2. Buscar totais gerais do mes
    print("2. Buscando totais gerais...")
    res_geral = buscar_fluxo(SESS, di, df_full)
    if not res_geral:
        print("   API nao respondeu - abortando fluxo (nao bloqueia workflow)")
        exit(0)  # exit(0) = nao falha o workflow
    totais_gerais = res_geral.get('totais', {})
    dados_p1 = res_geral.get('dados', [])
    paginacao = res_geral.get('paginacao', {})
    total_faturas = paginacao.get('Total', 0) or totais_gerais.get('Quantidade', 0)
    total_paginas = paginacao.get('TotalPaginas', 1)
    print(f"   ValorTotal={totais_gerais.get('ValorTotal', 0):.2f}, Qtd={total_faturas}, Paginas={total_paginas}")
    print(f"   Faturas na pagina 1: {len(dados_p1)}")

    # 3. Buscar TODAS as faturas para agrupamento real por vencimento
    print("3. Buscando todas as faturas...")
    todas_faturas = list(dados_p1)

    for pg in range(2, total_paginas + 1):
        time.sleep(1)
        if pg % 50 == 0:
            print(f"   Pagina {pg}/{total_paginas} ({len(todas_faturas)} faturas)...")
        res_pg = buscar_fluxo(SESS, di, df_full, pagina=pg, tentativas=2)
        if res_pg and res_pg.get('dados'):
            todas_faturas.extend(res_pg['dados'])
        else:
            print(f"   Pagina {pg} falhou - continuando...")
            # Re-login se necessario
            if pg % 100 == 0:
                SESS = login()
                if not SESS:
                    print("   Re-login falhou, parando coleta")
                    break

    print(f"   Total faturas coletadas: {len(todas_faturas)}")

    # 4. Agrupar por dia de vencimento
    print("4. Agrupando por vencimento...")
    vencimentos = {'05': {'total': 0, 'pago': 0, 'aberto': 0, 'cancelado': 0, 'qtd': 0},
                   '10': {'total': 0, 'pago': 0, 'aberto': 0, 'cancelado': 0, 'qtd': 0},
                   '15': {'total': 0, 'pago': 0, 'aberto': 0, 'cancelado': 0, 'qtd': 0},
                   '20': {'total': 0, 'pago': 0, 'aberto': 0, 'cancelado': 0, 'qtd': 0},
                   '25': {'total': 0, 'pago': 0, 'aberto': 0, 'cancelado': 0, 'qtd': 0},
                   '30': {'total': 0, 'pago': 0, 'aberto': 0, 'cancelado': 0, 'qtd': 0}}

    for f in todas_faturas:
        dv = f.get('FaturasDataVencimento', '')
        # Formato DD/MM/YYYY
        dia = '00'
        if '/' in dv:
            dia = dv[:2]
        elif '-' in dv:
            dia = dv[8:10]

        dia_num = int(dia) if dia.isdigit() else 0

        # Mapear para dia padrao
        if dia_num <= 7: dp = '05'
        elif dia_num <= 12: dp = '10'
        elif dia_num <= 17: dp = '15'
        elif dia_num <= 22: dp = '20'
        elif dia_num <= 27: dp = '25'
        else: dp = '30'

        # Parse valor (formato "R$ 1.234,56")
        def parse_valor(s):
            if not s: return 0
            s = s.replace('R$', '').strip().replace('.', '').replace(',', '.')
            try: return float(s)
            except: return 0

        val = parse_valor(f.get('FaturasValor', ''))
        pago = parse_valor(f.get('FaturasValorPago', ''))
        sit = (f.get('Situacao', '') or '').lower()

        vencimentos[dp]['total'] += val
        vencimentos[dp]['qtd'] += 1
        if 'pago' in sit:
            vencimentos[dp]['pago'] += pago
        elif 'cancelado' in sit:
            vencimentos[dp]['cancelado'] += val
        else:
            vencimentos[dp]['aberto'] += val

    # 5. Usar valores reais (soma direta das faturas agrupadas)
    print("5. Valores reais por vencimento...")
    vencimentos_final = vencimentos

    # 6. Salvar no cache
    print("6. Salvando no DB...")
    hash_key = f"fluxo|{di}|{df_full}|FaturasDataVencimento|"
    cache_data = {
        'totais': totais_gerais,
        'vencimentos': vencimentos_final,
        'dados': []
    }
    status = save_to_db(hash_key, di, df_full, cache_data)

    print(f"\n=== CONCLUIDO ===")
    print(f"ValorTotal: R$ {totais_gerais.get('ValorTotal', 0):,.2f}")
    print(f"Faturas coletadas: {len(todas_faturas)} de {total_faturas}")
    print(f"Vencimentos:")
    for d in sorted(vencimentos_final.keys()):
        v = vencimentos_final[d]
        print(f"  Dia {d}: Total=R${v['total']:,.2f}, Pago=R${v['pago']:,.2f}, Qtd={v['qtd']}")
    print(f"DB status: {status}")


if __name__ == "__main__":
    run()
