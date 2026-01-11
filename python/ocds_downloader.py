"""
OCDS Bulk Downloader - Descarga y procesa archivos masivos del Portal OCDS

API Endpoints:
- GET /api/v1/files?year=2024&month=4&source=seace_v3
  Retorna URLs de archivos: json, csv, xlsx, csv_es, xlsx_es, sha

- GET /api/v1/file/seace_v3/json/2024/04/
  Descarga archivo ZIP con JSON de todos los procesos del mes

Uso:
    python ocds_downloader.py --year 2024 --entidad "ELECTRO SUR ESTE"
    python ocds_downloader.py --year 2024 --month 12 --entidad ELSE
"""
import os
import sys
import json
import zipfile
import requests
import argparse
from pathlib import Path
from datetime import datetime
from typing import List, Dict, Optional, Any
from io import BytesIO

# Agregar path para imports
sys.path.insert(0, str(Path(__file__).parent))
from config import OUTPUT_DIR, CACHE_DIR, INPUT_DIR


class OCDSDownloader:
    """Descargador de archivos masivos OCDS"""

    BASE_URL = "https://contratacionesabiertas.oece.gob.pe/api/v1"

    def __init__(self, cache_dir: Path = None):
        self.cache_dir = cache_dir or CACHE_DIR
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.session = requests.Session()
        self.session.headers.update({
            "User-Agent": "Mozilla/5.0 SEACE-Downloader/1.0"
        })

    def get_file_urls(self, year: int, month: int = None, source: str = "seace_v3") -> List[Dict]:
        """
        Obtiene URLs de archivos disponibles para un periodo

        Args:
            year: Ano (ej: 2024)
            month: Mes opcional (1-12)
            source: Fuente de datos (seace_v3, seace_v2, etc)

        Returns:
            Lista de diccionarios con URLs de archivos
        """
        params = {"year": year, "source": source, "paginateBy": 100}
        if month:
            params["month"] = month

        response = self.session.get(f"{self.BASE_URL}/files", params=params)
        response.raise_for_status()

        data = response.json()
        return data.get("results", [])

    def download_json(self, year: int, month: int, source: str = "seace_v3") -> Path:
        """
        Descarga y extrae el archivo JSON de un mes

        Returns:
            Path al archivo JSON extraido
        """
        # Verificar cache
        cache_file = self.cache_dir / f"{year}-{month:02d}_{source}.json"
        if cache_file.exists():
            print(f"[CACHE] {cache_file.name}")
            return cache_file

        # Descargar
        url = f"{self.BASE_URL}/file/{source}/json/{year}/{month:02d}/"
        print(f"[DESCARGANDO] {url}")

        response = self.session.get(url, stream=True, timeout=300)
        response.raise_for_status()

        # Extraer ZIP
        with zipfile.ZipFile(BytesIO(response.content)) as zf:
            # Encontrar el archivo JSON
            json_files = [n for n in zf.namelist() if n.endswith('.json')]
            if not json_files:
                raise ValueError("No se encontro archivo JSON en el ZIP")

            # Extraer a cache
            json_name = json_files[0]
            with zf.open(json_name) as src:
                with open(cache_file, 'wb') as dst:
                    dst.write(src.read())

        size_mb = cache_file.stat().st_size / (1024 * 1024)
        print(f"[OK] {cache_file.name} ({size_mb:.1f} MB)")
        return cache_file

    def load_json(self, filepath: Path) -> Dict:
        """Carga un archivo JSON"""
        with open(filepath, 'r', encoding='utf-8') as f:
            return json.load(f)

    def filter_by_entity(self, records: List[Dict], entity_name: str) -> List[Dict]:
        """
        Filtra records por nombre de entidad

        Args:
            records: Lista de records OCDS
            entity_name: Nombre o parte del nombre de la entidad
        """
        entity_upper = entity_name.upper()
        filtered = []

        for record in records:
            compiled = record.get("compiledRelease", {})
            buyer = compiled.get("buyer", {})
            tender = compiled.get("tender", {})

            buyer_name = str(buyer.get("name", "")).upper()
            tender_title = str(tender.get("title", "")).upper()

            # Buscar en buyer name o en nomenclatura
            if entity_upper in buyer_name or entity_upper in tender_title:
                filtered.append(record)

        return filtered

    def process_record(self, record: Dict) -> Dict:
        """
        Procesa un record OCDS y extrae datos estructurados
        """
        compiled = record.get("compiledRelease", {})
        tender = compiled.get("tender", {})
        awards = compiled.get("awards", [])
        contracts = compiled.get("contracts", [])
        parties = compiled.get("parties", [])

        # Documentos
        documentos = []
        for doc in tender.get("documents", []):
            documentos.append({
                "titulo": doc.get("title"),
                "tipo": doc.get("documentType"),
                "formato": doc.get("format"),
                "url": doc.get("url"),
                "fecha": doc.get("datePublished")
            })

        for c in contracts:
            for doc in c.get("documents", []):
                documentos.append({
                    "titulo": doc.get("title", "Documento contrato"),
                    "tipo": doc.get("documentType"),
                    "formato": doc.get("format"),
                    "url": doc.get("url"),
                    "fecha": doc.get("datePublished")
                })

        # Postores
        postores = []
        for t in tender.get("tenderers", []):
            ruc = t.get("id", "").replace("PE-RUC-", "")
            postores.append({
                "ruc": ruc,
                "nombre": t.get("name")
            })

        # Ganador
        ganador = None
        monto_adjudicado = None
        fecha_buena_pro = None
        if awards:
            award = awards[0]
            fecha_buena_pro = award.get("date")
            monto_adjudicado = award.get("value", {}).get("amount")
            suppliers = award.get("suppliers", [])
            if suppliers:
                ganador = {
                    "ruc": suppliers[0].get("id", "").replace("PE-RUC-", ""),
                    "nombre": suppliers[0].get("name")
                }

        # Contrato
        contrato = None
        if contracts:
            c = contracts[0]
            contrato = {
                "numero": c.get("title"),
                "monto": c.get("value", {}).get("amount"),
                "moneda": c.get("value", {}).get("currency"),
                "fecha_firma": c.get("dateSigned"),
                "inicio": c.get("period", {}).get("startDate"),
                "fin": c.get("period", {}).get("endDate"),
                "duracion_dias": c.get("period", {}).get("durationInDays")
            }

        # Entidad
        entidad = {}
        for p in parties:
            if "buyer" in p.get("roles", []):
                ids = p.get("additionalIdentifiers", [])
                entidad = {
                    "nombre": p.get("name"),
                    "ruc": ids[0].get("id") if ids else None,
                    "direccion": p.get("address", {}).get("streetAddress"),
                    "departamento": p.get("address", {}).get("department"),
                    "region": p.get("address", {}).get("region"),
                    "telefono": p.get("contactPoint", {}).get("telephone")
                }
                break

        # Items
        items = []
        for item in tender.get("items", []):
            items.append({
                "descripcion": item.get("description"),
                "cantidad": item.get("quantity"),
                "unidad": item.get("unit", {}).get("name"),
                "clasificacion": item.get("classification", {}).get("description")
            })

        return {
            "ocid": compiled.get("ocid"),
            "nomenclatura": tender.get("title"),
            "convocatoria_id": tender.get("id"),
            "descripcion": tender.get("description"),
            "tipo_procedimiento": tender.get("procurementMethodDetails"),
            "metodo": tender.get("procurementMethod"),
            "categoria": tender.get("mainProcurementCategory"),
            "valor_referencial": tender.get("value", {}).get("amount"),
            "moneda": tender.get("value", {}).get("currency", "PEN"),
            "fecha_publicacion": tender.get("datePublished"),
            "cronograma": {
                "convocatoria_inicio": tender.get("tenderPeriod", {}).get("startDate"),
                "convocatoria_fin": tender.get("tenderPeriod", {}).get("endDate"),
                "consultas_inicio": tender.get("enquiryPeriod", {}).get("startDate"),
                "consultas_fin": tender.get("enquiryPeriod", {}).get("endDate"),
                "buena_pro": fecha_buena_pro
            },
            "entidad": entidad,
            "items": items,
            "postores": postores,
            "num_postores": len(postores),
            "ganador": ganador,
            "monto_adjudicado": monto_adjudicado,
            "contrato": contrato,
            "documentos": documentos,
            "num_documentos": len(documentos),
            "fuente": "OCDS_BULK"
        }


def descargar_procesos(
    year: int,
    months: List[int] = None,
    entidad: str = None,
    output_file: str = None
) -> List[Dict]:
    """
    Descarga y procesa procesos de OCDS

    Args:
        year: Ano
        months: Lista de meses (None = todos los disponibles)
        entidad: Filtrar por entidad (ej: "ELECTRO SUR ESTE" o "ELSE")
        output_file: Archivo de salida JSON

    Returns:
        Lista de procesos procesados
    """
    downloader = OCDSDownloader()
    all_processed = []

    # Obtener meses disponibles si no se especifican
    if months is None:
        file_infos = downloader.get_file_urls(year)
        months = [int(f["month"]) for f in file_infos]
        print(f"Meses disponibles para {year}: {months}")

    # Procesar cada mes
    for month in months:
        print(f"\n{'='*50}")
        print(f"Procesando {year}-{month:02d}")
        print("=" * 50)

        try:
            # Descargar JSON
            json_path = downloader.download_json(year, month)

            # Cargar datos
            data = downloader.load_json(json_path)
            records = data.get("records", [])
            print(f"Total records en archivo: {len(records)}")

            # Filtrar por entidad si se especifica
            if entidad:
                records = downloader.filter_by_entity(records, entidad)
                print(f"Records de '{entidad}': {len(records)}")

            # Procesar records
            for record in records:
                processed = downloader.process_record(record)
                processed["periodo"] = f"{year}-{month:02d}"
                all_processed.append(processed)

        except Exception as e:
            print(f"[ERROR] {year}-{month:02d}: {e}")

    print(f"\n{'='*50}")
    print(f"TOTAL PROCESOS: {len(all_processed)}")

    # Guardar resultados
    if output_file is None:
        entity_suffix = f"_{entidad.replace(' ', '_')}" if entidad else ""
        output_file = OUTPUT_DIR / f"ocds_{year}{entity_suffix}.json"
    else:
        output_file = Path(output_file)

    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(all_processed, f, ensure_ascii=False, indent=2)

    print(f"[OK] Guardado en: {output_file}")

    return all_processed


def main():
    parser = argparse.ArgumentParser(
        description="Descarga procesos OCDS del Portal de Contrataciones Abiertas"
    )
    parser.add_argument("--year", type=int, required=True, help="Ano (ej: 2024)")
    parser.add_argument("--month", type=int, help="Mes especifico (1-12)")
    parser.add_argument("--entidad", type=str, help="Filtrar por entidad (ej: 'ELECTRO SUR ESTE')")
    parser.add_argument("--output", type=str, help="Archivo de salida JSON")

    args = parser.parse_args()

    months = [args.month] if args.month else None

    procesos = descargar_procesos(
        year=args.year,
        months=months,
        entidad=args.entidad,
        output_file=args.output
    )

    # Mostrar resumen
    if procesos:
        print(f"\n{'='*50}")
        print("RESUMEN")
        print("=" * 50)

        # Por tipo
        tipos = {}
        for p in procesos:
            tipo = p.get("tipo_procedimiento", "N/A")
            tipos[tipo] = tipos.get(tipo, 0) + 1

        print("\nPor tipo de procedimiento:")
        for tipo, count in sorted(tipos.items(), key=lambda x: -x[1]):
            print(f"  {tipo}: {count}")

        # Por categoria
        categorias = {}
        for p in procesos:
            cat = p.get("categoria", "N/A")
            categorias[cat] = categorias.get(cat, 0) + 1

        print("\nPor categoria:")
        for cat, count in sorted(categorias.items(), key=lambda x: -x[1]):
            print(f"  {cat}: {count}")

        # Valor total
        valor_total = sum(p.get("valor_referencial", 0) or 0 for p in procesos)
        print(f"\nValor referencial total: S/ {valor_total:,.2f}")


if __name__ == "__main__":
    main()
