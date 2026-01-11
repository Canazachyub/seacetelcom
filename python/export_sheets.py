"""
Exporta datos OCDS a formato compatible con Google Sheets

Genera multiples CSVs:
- procesos.csv: Datos principales
- cronograma.csv: Fechas del cronograma
- postores.csv: Lista de postores por proceso
- documentos.csv: Documentos disponibles
"""
import csv
import json
import sys
from pathlib import Path
from datetime import datetime

sys.path.insert(0, str(Path(__file__).parent))
from config import OUTPUT_DIR


def export_to_sheets(json_file: str, output_prefix: str = None):
    """
    Exporta JSON de procesos a CSVs para Google Sheets

    Args:
        json_file: Archivo JSON con procesos
        output_prefix: Prefijo para archivos de salida
    """
    # Cargar datos
    with open(json_file, 'r', encoding='utf-8') as f:
        procesos = json.load(f)

    if output_prefix is None:
        output_prefix = OUTPUT_DIR / "sheets"

    output_prefix = Path(output_prefix)
    output_prefix.parent.mkdir(parents=True, exist_ok=True)

    # 1. PROCESOS (BD_PROCESOS)
    procesos_file = f"{output_prefix}_procesos.csv"
    with open(procesos_file, 'w', newline='', encoding='utf-8-sig') as f:
        writer = csv.writer(f)
        writer.writerow([
            'OCID', 'NOMENCLATURA', 'DESCRIPCION', 'TIPO_PROCEDIMIENTO',
            'CATEGORIA', 'ENTIDAD', 'RUC_ENTIDAD', 'DEPARTAMENTO',
            'VALOR_REFERENCIAL', 'MONEDA', 'FECHA_PUBLICACION',
            'NUM_POSTORES', 'GANADOR', 'RUC_GANADOR', 'MONTO_ADJUDICADO',
            'CONTRATO_NUM', 'CONTRATO_MONTO', 'CONTRATO_INICIO', 'CONTRATO_FIN',
            'NUM_DOCUMENTOS', 'PERIODO'
        ])

        for p in procesos:
            entidad = p.get('entidad', {}) or {}
            ganador = p.get('ganador', {}) or {}
            contrato = p.get('contrato', {}) or {}

            writer.writerow([
                p.get('ocid'),
                p.get('nomenclatura'),
                p.get('descripcion'),
                p.get('tipo_procedimiento'),
                p.get('categoria'),
                entidad.get('nombre'),
                entidad.get('ruc'),
                entidad.get('departamento'),
                p.get('valor_referencial'),
                p.get('moneda'),
                p.get('fecha_publicacion'),
                p.get('num_postores'),
                ganador.get('nombre') if ganador else '',
                ganador.get('ruc') if ganador else '',
                p.get('monto_adjudicado'),
                contrato.get('numero') if contrato else '',
                contrato.get('monto') if contrato else '',
                contrato.get('inicio') if contrato else '',
                contrato.get('fin') if contrato else '',
                p.get('num_documentos'),
                p.get('periodo')
            ])

    print(f"[OK] {procesos_file} ({len(procesos)} filas)")

    # 2. CRONOGRAMA
    cronograma_file = f"{output_prefix}_cronograma.csv"
    with open(cronograma_file, 'w', newline='', encoding='utf-8-sig') as f:
        writer = csv.writer(f)
        writer.writerow([
            'NOMENCLATURA', 'CONVOCATORIA_INICIO', 'CONVOCATORIA_FIN',
            'CONSULTAS_INICIO', 'CONSULTAS_FIN', 'BUENA_PRO'
        ])

        for p in procesos:
            crono = p.get('cronograma', {}) or {}
            writer.writerow([
                p.get('nomenclatura'),
                crono.get('convocatoria_inicio'),
                crono.get('convocatoria_fin'),
                crono.get('consultas_inicio'),
                crono.get('consultas_fin'),
                crono.get('buena_pro')
            ])

    print(f"[OK] {cronograma_file}")

    # 3. POSTORES
    postores_file = f"{output_prefix}_postores.csv"
    with open(postores_file, 'w', newline='', encoding='utf-8-sig') as f:
        writer = csv.writer(f)
        writer.writerow(['NOMENCLATURA', 'RUC', 'NOMBRE', 'ES_GANADOR'])

        for p in procesos:
            ganador_ruc = (p.get('ganador') or {}).get('ruc', '')
            for postor in p.get('postores', []):
                es_ganador = 'SI' if postor.get('ruc') == ganador_ruc else 'NO'
                writer.writerow([
                    p.get('nomenclatura'),
                    postor.get('ruc'),
                    postor.get('nombre'),
                    es_ganador
                ])

    total_postores = sum(len(p.get('postores', [])) for p in procesos)
    print(f"[OK] {postores_file} ({total_postores} filas)")

    # 4. DOCUMENTOS
    documentos_file = f"{output_prefix}_documentos.csv"
    with open(documentos_file, 'w', newline='', encoding='utf-8-sig') as f:
        writer = csv.writer(f)
        writer.writerow(['NOMENCLATURA', 'TITULO', 'TIPO', 'FORMATO', 'URL', 'FECHA'])

        for p in procesos:
            for doc in p.get('documentos', []):
                writer.writerow([
                    p.get('nomenclatura'),
                    doc.get('titulo'),
                    doc.get('tipo'),
                    doc.get('formato'),
                    doc.get('url'),
                    doc.get('fecha')
                ])

    total_docs = sum(len(p.get('documentos', [])) for p in procesos)
    print(f"[OK] {documentos_file} ({total_docs} filas)")

    # 5. ITEMS
    items_file = f"{output_prefix}_items.csv"
    with open(items_file, 'w', newline='', encoding='utf-8-sig') as f:
        writer = csv.writer(f)
        writer.writerow(['NOMENCLATURA', 'DESCRIPCION', 'CANTIDAD', 'UNIDAD', 'CLASIFICACION'])

        for p in procesos:
            for item in p.get('items', []):
                writer.writerow([
                    p.get('nomenclatura'),
                    item.get('descripcion'),
                    item.get('cantidad'),
                    item.get('unidad'),
                    item.get('clasificacion')
                ])

    total_items = sum(len(p.get('items', [])) for p in procesos)
    print(f"[OK] {items_file} ({total_items} filas)")

    print(f"\n{'='*50}")
    print("ARCHIVOS GENERADOS:")
    print(f"  - {procesos_file}")
    print(f"  - {cronograma_file}")
    print(f"  - {postores_file}")
    print(f"  - {documentos_file}")
    print(f"  - {items_file}")
    print("\nPuedes importar estos CSVs directamente a Google Sheets")


def main():
    if len(sys.argv) < 2:
        print("Uso: python export_sheets.py <archivo.json> [prefijo_salida]")
        print("\nEjemplo:")
        print("  python export_sheets.py ../data/output/ocds_2024_ELSE.json")
        return

    json_file = sys.argv[1]
    output_prefix = sys.argv[2] if len(sys.argv) > 2 else None

    export_to_sheets(json_file, output_prefix)


if __name__ == "__main__":
    main()
