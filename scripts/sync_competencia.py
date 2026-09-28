"""Genera src/data/competencia.json a partir del vault INGENIERIA TELCOM (experiencia SEACE).

Lee 01_GERENCIA/experiencia/web/{procesos,postores}.json y resume, por entidad, los procesos en
que compitió Telcom, cuántos ganó y los rivales conocidos con su % del valor referencial.
Solo copia RUC, razón social y montos: las ofertas de terceros (CV, DNI) se quedan en el vault
(docs/07 §6).

Uso:  python scripts/sync_competencia.py [ruta_del_vault]
"""
import json
import os
import re
import sys
from collections import defaultdict
from datetime import date

VAULT = sys.argv[1] if len(sys.argv) > 1 else r'C:\Users\User\Documents\CEREBRO DIGITAL\INGENERIA TELCOM'
WEB = os.path.join(VAULT, '01_GERENCIA', 'experiencia', 'web')
SALIDA = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'src', 'data', 'competencia.json')

# Nombre de entidad del vault -> EMPRESA_CORTA del radar
ENTIDADES = [
    (r'SUR ESTE', 'ELSE'),
    (r'ELECTROSUR', 'ELECTROSUR'),
    (r'UCAYALI', 'ELECTRO UCAYALI'),
    (r'PUNO', 'ELECTRO PUNO'),
    (r'ORIENTE', 'ELECTRO ORIENTE'),
]


def empresa(nombre):
    n = (nombre or '').upper()
    for patron, corta in ENTIDADES:
        if re.search(patron, n):
            return corta
    return None


def main():
    procesos = json.load(open(os.path.join(WEB, 'procesos.json'), encoding='utf-8'))
    postores = json.load(open(os.path.join(WEB, 'postores.json'), encoding='utf-8'))

    por_proceso = defaultdict(list)
    for p in postores:
        por_proceso[p['nomenclatura']].append(p)

    entidades = {}
    for pr in procesos:
        corta = empresa(pr.get('entidad'))
        if not corta:
            print(f"[WARN] entidad sin mapear: {pr.get('entidad')}")
            continue
        e = entidades.setdefault(corta, {'procesos': 0, 'presentados': 0, 'ganados': 0,
                                         'telcomPctVr': [], 'rivales': {}})
        e['procesos'] += 1
        filas = por_proceso.get(pr['nomenclatura'], [])
        telcom = [f for f in filas if f.get('es_telcom')]
        if telcom:
            e['presentados'] += 1
            if any(f.get('gano') for f in telcom):
                e['ganados'] += 1
            if telcom[0].get('pct_vr') is not None:
                e['telcomPctVr'].append(telcom[0]['pct_vr'])
        for f in filas:
            if f.get('es_telcom'):
                continue
            r = e['rivales'].setdefault(f['ruc'], {'ruc': f['ruc'], 'nombre': f.get('razon_social', ''),
                                                   'procesos': 0, 'ganados': 0, 'pctVr': []})
            r['procesos'] += 1
            r['ganados'] += 1 if f.get('gano') else 0
            if f.get('pct_vr') is not None:
                r['pctVr'].append(f['pct_vr'])

    def prom(xs):
        return round(sum(xs) / len(xs), 1) if xs else None

    salida = {'generado': date.today().isoformat(), 'fuente': '01_GERENCIA/experiencia/web (vault INGENIERIA TELCOM)',
              'entidades': {}}
    for corta, e in sorted(entidades.items()):
        rivales = sorted(e['rivales'].values(), key=lambda r: -r['procesos'])
        salida['entidades'][corta] = {
            'procesos': e['procesos'],
            'presentados': e['presentados'],
            'ganados': e['ganados'],
            'telcomPctVr': prom(e['telcomPctVr']),
            'rivales': [{'ruc': r['ruc'], 'nombre': r['nombre'], 'procesos': r['procesos'],
                         'ganados': r['ganados'], 'pctVr': prom(r['pctVr'])} for r in rivales],
        }

    os.makedirs(os.path.dirname(SALIDA), exist_ok=True)
    json.dump(salida, open(SALIDA, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(f"OK {SALIDA}")
    for corta, e in salida['entidades'].items():
        print(f"  {corta:<16} {e['procesos']} procesos · Telcom {e['ganados']}/{e['presentados']} · "
              f"{len(e['rivales'])} rivales · Telcom {e['telcomPctVr']}% VR")


if __name__ == '__main__':
    main()
