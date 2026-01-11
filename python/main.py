"""
SEACE Intelligence - Script Principal
Procesa Excel de SEACE y enriquece con datos de fichas
"""
import argparse
import json
from pathlib import Path
from datetime import datetime
from tqdm import tqdm

from excel_processor import ExcelProcessor
from seace_scraper import scrape_proceso, SeaceScraper
from config import INPUT_DIR, OUTPUT_DIR


def procesar_excel_completo(
    excel_path: str,
    output_path: str = None,
    scrape: bool = True,
    max_procesos: int = None,
    use_cache: bool = True
):
    """
    Procesa un archivo Excel de SEACE y opcionalmente enriquece con scraping

    Args:
        excel_path: Ruta al archivo Excel
        output_path: Ruta para guardar resultados
        scrape: Si hacer scraping de fichas
        max_procesos: Maximo de procesos a scrapear (None = todos)
        use_cache: Si usar cache de scraping
    """
    print("=" * 60)
    print("SEACE Intelligence - Procesador")
    print("=" * 60)

    # 1. Procesar Excel
    print(f"\n[1] Cargando: {excel_path}")
    processor = ExcelProcessor()
    df = processor.cargar_excel(excel_path)

    print(f"    {len(df)} procesos cargados")
    print(f"\n    Resumen:")
    resumen = processor.resumen()
    for key, value in resumen.items():
        if isinstance(value, dict):
            print(f"    {key}:")
            for k, v in list(value.items())[:5]:
                print(f"      - {k}: {v}")
        else:
            print(f"    {key}: {value}")

    # 2. Obtener nomenclaturas
    nomenclaturas = processor.get_nomenclaturas()
    if max_procesos:
        nomenclaturas = nomenclaturas[:max_procesos]

    print(f"\n[2] {len(nomenclaturas)} procesos para procesar")

    # 3. Scraping (si esta habilitado)
    datos_enriquecidos = []

    if scrape:
        print(f"\n[3] Iniciando scraping de fichas...")

        with SeaceScraper(use_cache=use_cache, headless=True) as scraper:
            for nom in tqdm(nomenclaturas, desc="Scrapeando"):
                try:
                    # Buscar ficha
                    ficha_id = scraper.buscar_proceso(nom)

                    if ficha_id:
                        datos = scraper.extraer_ficha(ficha_id, nom)
                        datos["success"] = datos.get("error") is None
                    else:
                        datos = {
                            "nomenclatura": nom,
                            "error": "No encontrado",
                            "success": False
                        }

                    datos_enriquecidos.append(datos)

                except Exception as e:
                    datos_enriquecidos.append({
                        "nomenclatura": nom,
                        "error": str(e),
                        "success": False
                    })

    # 4. Combinar datos
    print("\n[4] Combinando datos...")

    resultados = []
    for _, row in df.iterrows():
        nom = row.get('nomenclatura')

        # Datos base del Excel
        resultado = row.to_dict()

        # Agregar datos scrapeados si existen
        if scrape:
            datos_ficha = next(
                (d for d in datos_enriquecidos if d.get('nomenclatura') == nom),
                None
            )
            if datos_ficha:
                resultado['ficha'] = datos_ficha

        resultados.append(resultado)

    # 5. Guardar resultados
    if output_path is None:
        output_path = OUTPUT_DIR / f"seace_completo_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    else:
        output_path = Path(output_path)

    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(resultados, f, ensure_ascii=False, indent=2, default=str)

    print(f"\n[OK] Resultados guardados en: {output_path}")

    # 6. Estadisticas finales
    if scrape:
        exitosos = sum(1 for d in datos_enriquecidos if d.get('success'))
        fallidos = len(datos_enriquecidos) - exitosos
        print(f"\n    Estadisticas de scraping:")
        print(f"    - Exitosos: {exitosos}")
        print(f"    - Fallidos: {fallidos}")

    return resultados


def main():
    parser = argparse.ArgumentParser(description='SEACE Intelligence - Procesador')

    parser.add_argument(
        'excel_path',
        help='Ruta al archivo Excel exportado de SEACE'
    )

    parser.add_argument(
        '-o', '--output',
        help='Ruta para guardar resultados JSON',
        default=None
    )

    parser.add_argument(
        '--no-scrape',
        action='store_true',
        help='Solo procesar Excel sin scraping'
    )

    parser.add_argument(
        '--max',
        type=int,
        help='Maximo de procesos a scrapear',
        default=None
    )

    parser.add_argument(
        '--no-cache',
        action='store_true',
        help='No usar cache de scraping'
    )

    args = parser.parse_args()

    procesar_excel_completo(
        excel_path=args.excel_path,
        output_path=args.output,
        scrape=not args.no_scrape,
        max_procesos=args.max,
        use_cache=not args.no_cache
    )


if __name__ == "__main__":
    main()
