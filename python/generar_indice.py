"""
Genera el archivo OCDS_INDEX.csv para importar a Google Sheets

Uso:
    python generar_indice.py                    # Solo ELSE 2024
    python generar_indice.py --all              # TODOS los procesos 2021-2024
    python generar_indice.py --year 2023        # Todos los de 2023
    python generar_indice.py --else --all       # Solo ELSE 2021-2024

El archivo se genera en data/output/OCDS_INDEX.csv
Luego copia el contenido a la hoja OCDS_INDEX de tu Google Sheets
"""
import csv
import json
import requests
import time
import argparse
from datetime import datetime
from pathlib import Path

# Rutas
BASE_DIR = Path(__file__).parent.parent  # c:\PROGRAMACION\SEACE
CACHE_DIR = BASE_DIR / "data" / "cache"
OUTPUT_DIR = BASE_DIR / "data" / "output"
OUTPUT_FILE = OUTPUT_DIR / "OCDS_INDEX.csv"

# API Config
BASE_URL = "https://contratacionesabiertas.oece.gob.pe/api/v1"
RATE_LIMIT = 0.5  # segundos entre requests

def get_available_months(year: int) -> list:
    """Obtiene los meses disponibles para un año"""
    url = f"{BASE_URL}/files?year={year}&source=seace_v3"
    try:
        resp = requests.get(url, timeout=30)
        if resp.status_code == 200:
            data = resp.json()
            return [int(r['month']) for r in data.get('results', [])]
    except Exception as e:
        print(f"  [WARN] Error obteniendo meses de {year}: {e}")
    return []

def download_month(year: int, month: int, filter_text: str = None) -> list:
    """Descarga todos los procesos de un mes"""
    cache_file = CACHE_DIR / f"{year}-{month:02d}_seace_v3.json"

    # Usar cache si existe
    if cache_file.exists():
        print(f"  [CACHE] {year}-{month:02d}", end='', flush=True)
        with open(cache_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
        # Manejar ambos formatos de cache
        if isinstance(data, dict) and 'records' in data:
            records = data['records']
        else:
            records = data
        print(f" ({len(records):,} registros)")
    else:
        print(f"  [API] {year}-{month:02d}...", end='', flush=True)
        records = []
        page = 1
        data_seg = f"{year}-{month:02d}"

        while page <= 200:  # Max 200 paginas
            url = f"{BASE_URL}/records?sourceId=seace_v3&dataSegmentationID={data_seg}&page={page}"
            try:
                time.sleep(RATE_LIMIT)
                resp = requests.get(url, timeout=60)
                if resp.status_code != 200:
                    break
                data = resp.json()
                page_records = data.get('records', [])
                if not page_records:
                    break
                records.extend(page_records)
                # Mostrar progreso cada 5 páginas
                if page % 5 == 0:
                    print(f" pag {page} ({len(records)} rec)...", end='', flush=True)
                page += 1
            except Exception as e:
                print(f" Error: {e}")
                break

        print(f" TOTAL: {len(records)} records")

        # Guardar en cache
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        with open(cache_file, 'w', encoding='utf-8') as f:
            json.dump(records, f)

    # Extraer datos relevantes
    procesos = []
    for record in records:
        compiled = record.get('compiledRelease', {})
        tender = compiled.get('tender', {})
        buyer = compiled.get('buyer', {})

        nomenclatura = tender.get('title', '')
        entidad = buyer.get('name', '')

        # Aplicar filtro si existe
        if filter_text:
            filter_upper = filter_text.upper()
            if filter_upper not in nomenclatura.upper() and filter_upper not in entidad.upper():
                continue

        procesos.append({
            'nomenclatura': nomenclatura,
            'tender_id': tender.get('id', ''),
            'ocid': compiled.get('ocid', ''),
            'entidad': entidad,
            'descripcion': tender.get('description', ''),
            'valor': tender.get('value', {}).get('amount', 0),
            'year': year,
            'month': month
        })

    return procesos

def main():
    parser = argparse.ArgumentParser(description='Generar indice OCDS')
    parser.add_argument('--all', action='store_true', help='Descargar todos los años (2021-2024)')
    parser.add_argument('--year', type=int, help='Año específico')
    parser.add_argument('--else', dest='else_mode', action='store_true', help='Solo ELSE')
    parser.add_argument('--filter', type=str, help='Filtro de texto')
    args = parser.parse_args()

    # Determinar años a procesar
    if args.all:
        years = [2022, 2023, 2024, 2025]
    elif args.year:
        years = [args.year]
    else:
        years = [2024]  # Default

    # Determinar filtro
    filter_text = None
    if args.else_mode:
        filter_text = 'ELSE'
    elif args.filter:
        filter_text = args.filter

    print(f"\n{'='*60}")
    print(f"GENERADOR DE INDICE OCDS")
    print(f"{'='*60}")
    print(f"Años: {years}")
    print(f"Filtro: {filter_text or 'NINGUNO (todos los procesos)'}")
    print(f"{'='*60}\n")

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    all_procesos = []

    for year in years:
        print(f"\n[{year}] Obteniendo meses disponibles...")
        months = get_available_months(year)

        if not months:
            print(f"  [WARN] No hay datos para {year}")
            continue

        print(f"  Meses disponibles: {months}")

        for month in sorted(months):
            procesos = download_month(year, month, filter_text)
            all_procesos.extend(procesos)
            print(f"    -> {len(procesos)} procesos{' (filtrados)' if filter_text else ''}")

    # Eliminar duplicados por nomenclatura (mantener el más reciente)
    seen = {}
    for p in all_procesos:
        key = p['nomenclatura']
        if key and (key not in seen or p['year'] > seen[key]['year']):
            seen[key] = p

    unique_procesos = list(seen.values())

    # Generar CSV
    fecha_actual = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

    with open(OUTPUT_FILE, 'w', newline='', encoding='utf-8-sig') as f:
        writer = csv.writer(f)
        writer.writerow(['NOMENCLATURA', 'TENDER_ID', 'OCID', 'ENTIDAD', 'DESCRIPCION', 'FECHA_ACTUALIZACION'])

        for p in sorted(unique_procesos, key=lambda x: x['nomenclatura']):
            writer.writerow([
                p['nomenclatura'],
                p['tender_id'],
                p['ocid'],
                p['entidad'],
                p['descripcion'][:200] if p['descripcion'] else '',  # Limitar descripción
                fecha_actual
            ])

    print(f"\n{'='*60}")
    print(f"ARCHIVO GENERADO: {OUTPUT_FILE}")
    print(f"TOTAL REGISTROS: {len(unique_procesos)}")
    print(f"{'='*60}")
    print("\nSIGUIENTES PASOS:")
    print("1. Abre el archivo OCDS_INDEX.csv")
    print("2. Selecciona desde A2 hasta el final (NO los headers)")
    print("3. Copia (Ctrl+C)")
    print("4. Ve a Google Sheets, hoja OCDS_INDEX")
    print("5. Click en celda A2 y pega (Ctrl+V)")
    print(f"{'='*60}\n")

if __name__ == "__main__":
    main()
