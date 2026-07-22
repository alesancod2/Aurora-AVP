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
    # FaturasTipo=2 = Contribuição (valores batem com sistema AEasy)
    params = (
        f"OrdenarPor=FaturasDataVencimento"
        f"&TipoData={tipo_data}"
        f"&DataInicial={di}"
        f"&DataFinal={df}"
        f"&Nome=&NomeFantasia=&Placa=&GruposConsultoresId="
        f"&TipoBaixa=&FaturasTipo=2&FormaCobranca=&FaturasParcela="
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
        exit(0)
    print(f"   OK")

    # 2. Buscar totais gerais do mes (para KPIs)
    print("2. Buscando totais gerais do mes...")
    res_geral = buscar_fluxo(SESS, di, df_full)
    if not res_geral:
        print("   API nao respondeu - abortando")
        exit(0)
    totais_gerais = res_geral.get('totais', {})
    print(f"   ValorTotal={totais_gerais.get('ValorTotal', 0):.2f}, Qtd={totais_gerais.get('Quantidade', 0)}")

    # 3. Buscar por DIA EXATO de vencimento (DataInicial=DataFinal=dia)
    # Isso replica o comportamento do painel AEasy
    print("3. Buscando por dia exato de vencimento...")
    dias_vencimento = [5, 10, 15, 20, 25, 30]
    vencimentos = {}

    for dia in dias_vencimento:
        dia_str = f"{ano}-{mes}-{dia:02d}"
        print(f"   Dia {dia:02d} ({dia_str})...")
        # Buscar com DataInicial=DataFinal=dia exato (1 request por vencimento)
        res = buscar_fluxo(SESS, dia_str, dia_str, tentativas=2)
        if res:
            t = res.get('totais', {})
            vencimentos[f"{dia:02d}"] = {
                'total': t.get('ValorTotal', 0),
                'pago': t.get('ValorPago', 0),
                'aberto': t.get('ValorAberto', 0),
                'cancelado': t.get('ValorCancelado', 0),
                'qtd': int(t.get('Quantidade', 0))
            }
            print(f"     Total=R${t.get('ValorTotal',0):,.2f}, Pago=R${t.get('ValorPago',0):,.2f}, Qtd={t.get('Quantidade',0)}")
        else:
            vencimentos[f"{dia:02d}"] = {'total': 0, 'pago': 0, 'aberto': 0, 'cancelado': 0, 'qtd': 0}
            print(f"     Sem dados")
        time.sleep(2)

    # 4. Buscar renegociacao (dias fora do padrao)
    # Soma do mes completo - soma dos dias padrao = renegociacao
    print("4. Calculando renegociacao...")
    soma_padrao = {
        'total': sum(v['total'] for v in vencimentos.values()),
        'pago': sum(v['pago'] for v in vencimentos.values()),
        'aberto': sum(v['aberto'] for v in vencimentos.values()),
        'cancelado': sum(v['cancelado'] for v in vencimentos.values()),
        'qtd': sum(v['qtd'] for v in vencimentos.values())
    }
    renegociacao = {
        'total': max(0, (totais_gerais.get('ValorTotal', 0) or 0) - soma_padrao['total']),
        'pago': max(0, (totais_gerais.get('ValorPago', 0) or 0) - soma_padrao['pago']),
        'aberto': max(0, (totais_gerais.get('ValorAberto', 0) or 0) - soma_padrao['aberto']),
        'cancelado': max(0, (totais_gerais.get('ValorCancelado', 0) or 0) - soma_padrao['cancelado']),
        'qtd': max(0, int(totais_gerais.get('Quantidade', 0) or 0) - soma_padrao['qtd'])
    }
    print(f"   Renegociacao: Total=R${renegociacao['total']:,.2f}, Qtd={renegociacao['qtd']}")

    # 5. Salvar no cache
    print("5. Salvando no DB...")
    hash_key = f"fluxo|{di}|{df_full}|FaturasDataVencimento|"
    cache_data = {
        'totais': totais_gerais,
        'vencimentos': vencimentos,
        'renegociacao': renegociacao,
        'dados': []
    }
    status = save_to_db(hash_key, di, df_full, cache_data)

    print(f"\n=== CONCLUIDO ===")
    print(f"ValorTotal Mes: R$ {totais_gerais.get('ValorTotal', 0):,.2f}")
    print(f"Vencimentos:")
    for d in sorted(vencimentos.keys()):
        v = vencimentos[d]
        print(f"  Dia {d}: Total=R${v['total']:,.2f}, Pago=R${v['pago']:,.2f}, Qtd={v['qtd']}")
    print(f"Renegociacao: Total=R${renegociacao['total']:,.2f}, Qtd={renegociacao['qtd']}")
    print(f"DB status: {status}")


if __name__ == "__main__":
    run()
