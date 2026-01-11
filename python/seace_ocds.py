"""
SEACE OCDS - Cliente Unificado para Contrataciones Abiertas de Peru

API Base: https://contratacionesabiertas.oece.gob.pe/api/v1
Prefijo OCID: ocds-dgv273
Sin autenticacion requerida

METODOS DISPONIBLES:
1. get_by_ocid(ocid) - Consulta directa por OCID
2. get_by_tender_id(tender_id) - Consulta por ID de expediente
3. search_by_dates(start, end) - Busqueda por rango de fechas
4. download_month(year, month) - Descarga masiva mensual
5. search_else(year) - Busca todos los procesos ELSE

ESTRUCTURA OCID:
- ocds-dgv273-seacev3-{year}-{buyer_id}-{sequence}
- ocds-dgv273-seacev2-{tender_id}

ESTRUCTURA tender.id:
- SEACE v3: Codigo de expediente (ej: 1009388)
- SEACE v2: ID de convocatoria (ej: 3496677)

ESTRUCTURA tender.title (nomenclatura):
- Formato: {tipo}-{modalidad}-{numero}-{year}-{sigla}-{version}
- Ejemplo: AS-SM-35-2024-ELSE-1
"""
import requests
import json
import time
import zipfile
from io import BytesIO
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional, Dict, List, Any, Union
import sys

sys.path.insert(0, str(Path(__file__).parent))
from config import OUTPUT_DIR, CACHE_DIR


class SeaceOCDS:
    """Cliente unificado para la API OCDS de SEACE Peru"""

    BASE_URL = "https://contratacionesabiertas.oece.gob.pe/api/v1"
    OCID_PREFIX = "ocds-dgv273"

    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            "User-Agent": "SEACE-OCDS-Client/2.0",
            "Accept": "application/json"
        })
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # ==================== CONSULTAS DIRECTAS ====================

    def get_by_ocid(self, ocid: str) -> Optional[Dict]:
        """
        Obtiene un proceso por su OCID completo

        Args:
            ocid: Identificador OCDS completo
                  Ej: "ocds-dgv273-seacev3-2024-2407-110"

        Returns:
            Proceso estructurado o None
        """
        if not ocid.startswith(self.OCID_PREFIX):
            ocid = f"{self.OCID_PREFIX}-{ocid}"

        url = f"{self.BASE_URL}/record/{ocid}"
        return self._fetch_and_process(url)

    def get_by_tender_id(self, tender_id: str, source: str = "seace_v3") -> Optional[Dict]:
        """
        Obtiene un proceso por su tender.id (codigo de expediente)

        Args:
            tender_id: ID del expediente SEACE
                       SEACE v3: ej "1009388"
                       SEACE v2: ej "3496677"
            source: "seace_v3" o "seace_v2"

        Returns:
            Proceso estructurado o None
        """
        url = f"{self.BASE_URL}/record/{source}/{tender_id}"
        return self._fetch_and_process(url)

    def get_by_nomenclatura(self, nomenclatura: str) -> Optional[Dict]:
        """
        Busca un proceso por su nomenclatura (tender.title)

        Args:
            nomenclatura: Ej "AS-SM-35-2024-ELSE-1"

        Returns:
            Proceso estructurado o None

        Nota: Este metodo usa busqueda por fechas ya que tenderTitle
              no funciona correctamente en la API
        """
        # Extraer ano de la nomenclatura
        parts = nomenclatura.split("-")
        year = None
        for p in parts:
            if p.isdigit() and len(p) == 4 and p.startswith("20"):
                year = int(p)
                break

        if not year:
            print(f"[ERROR] No se pudo extraer ano de: {nomenclatura}")
            return None

        # Buscar en el ano completo
        procesos = self.download_year(year, filter_text=nomenclatura)

        for p in procesos:
            if p.get("nomenclatura") == nomenclatura:
                return p

        return None

    # ==================== BUSQUEDAS ====================

    def search_by_dates(
        self,
        start_date: str,
        end_date: str = None,
        source: str = "seace_v3",
        category: str = None,
        max_pages: int = 500
    ) -> List[Dict]:
        """
        Busca procesos por rango de fechas

        Args:
            start_date: Fecha inicio "YYYY-MM-DD"
            end_date: Fecha fin "YYYY-MM-DD" (default: start_date + 15 dias)
            source: "seace_v3" o "seace_v2"
            category: "goods", "works", "services" o None
            max_pages: Maximo de paginas a recorrer

        Returns:
            Lista de procesos
        """
        results = []
        page = 1

        params = {
            "sourceId": source,
            "startDate": start_date,
            "page": page
        }

        if end_date:
            params["endDate"] = end_date

        if category:
            params["mainProcurementCategory"] = category

        print(f"[API] Buscando {start_date} a {end_date or 'default'}...")

        while page <= max_pages:
            params["page"] = page

            try:
                r = self.session.get(f"{self.BASE_URL}/records", params=params, timeout=60)
                if r.status_code != 200:
                    break

                data = r.json()
                records = data.get("records", [])

                if not records:
                    break

                for record in records:
                    results.append(self._process_record(record))

                print(f"  Pagina {page}: {len(records)} records (total: {len(results)})")
                page += 1
                time.sleep(0.3)

            except Exception as e:
                print(f"[ERROR] Pagina {page}: {e}")
                break

        return results

    # ==================== DESCARGAS MASIVAS ====================

    def download_month(
        self,
        year: int,
        month: int,
        source: str = "seace_v3",
        filter_text: str = None
    ) -> List[Dict]:
        """
        Descarga todos los procesos de un mes via archivo masivo

        Args:
            year: Ano (ej: 2024)
            month: Mes (1-12)
            source: "seace_v3" o "seace_v2"
            filter_text: Texto para filtrar (ej: "ELSE", "ELECTRO SUR ESTE")

        Returns:
            Lista de procesos
        """
        # Verificar cache
        cache_file = CACHE_DIR / f"{year}-{month:02d}_{source}.json"

        if cache_file.exists():
            print(f"[CACHE] {cache_file.name}")
            with open(cache_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
        else:
            # Descargar
            url = f"{self.BASE_URL}/file/{source}/json/{year}/{month:02d}/"
            print(f"[DOWNLOAD] {year}-{month:02d}...")

            try:
                r = self.session.get(url, timeout=300)
                r.raise_for_status()

                with zipfile.ZipFile(BytesIO(r.content)) as zf:
                    json_files = [n for n in zf.namelist() if n.endswith('.json')]
                    if not json_files:
                        print(f"[ERROR] No JSON en ZIP")
                        return []

                    with zf.open(json_files[0]) as src:
                        content = src.read().decode('utf-8')
                        data = json.loads(content)

                        # Guardar en cache
                        with open(cache_file, 'w', encoding='utf-8') as f:
                            f.write(content)

                size_mb = cache_file.stat().st_size / (1024 * 1024)
                print(f"[OK] {cache_file.name} ({size_mb:.1f} MB)")

            except Exception as e:
                print(f"[ERROR] Download: {e}")
                return []

        # Procesar records
        records = data.get("records", [])
        print(f"  Total records: {len(records)}")

        results = []
        filter_upper = filter_text.upper() if filter_text else None

        for record in records:
            # Aplicar filtro si existe
            if filter_upper:
                compiled = record.get("compiledRelease", {})
                buyer_name = str(compiled.get("buyer", {}).get("name", "")).upper()
                tender_title = str(compiled.get("tender", {}).get("title", "")).upper()

                if filter_upper not in buyer_name and filter_upper not in tender_title:
                    continue

            results.append(self._process_record(record))

        if filter_text:
            print(f"  Filtrados '{filter_text}': {len(results)}")

        return results

    def download_year(
        self,
        year: int,
        source: str = "seace_v3",
        filter_text: str = None,
        months: List[int] = None
    ) -> List[Dict]:
        """
        Descarga todos los procesos de un ano

        Args:
            year: Ano
            source: "seace_v3" o "seace_v2"
            filter_text: Texto para filtrar
            months: Lista de meses (None = todos)

        Returns:
            Lista de procesos
        """
        if months is None:
            months = list(range(1, 13))

        all_results = []

        for month in months:
            results = self.download_month(year, month, source, filter_text)
            all_results.extend(results)

        return all_results

    # ==================== METODOS ESPECIFICOS ELSE ====================

    def search_else(self, year: int, months: List[int] = None) -> List[Dict]:
        """
        Busca todos los procesos de ELECTRO SUR ESTE

        Args:
            year: Ano
            months: Lista de meses (None = todos)

        Returns:
            Lista de procesos ELSE
        """
        return self.download_year(year, filter_text="ELSE", months=months)

    # ==================== PROCESAMIENTO ====================

    def _fetch_and_process(self, url: str) -> Optional[Dict]:
        """Fetch URL y procesa el record"""
        try:
            r = self.session.get(url, timeout=30)
            if r.status_code == 200:
                data = r.json()
                records = data.get("records", [])
                if records:
                    return self._process_record(records[0])
        except Exception as e:
            print(f"[ERROR] {url}: {e}")
        return None

    def _process_record(self, record: Dict) -> Dict:
        """Extrae datos estructurados de un record OCDS"""
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
                    "url": doc.get("url"),
                    "fecha": doc.get("datePublished")
                })

        # Postores
        postores = [
            {"ruc": t.get("id", "").replace("PE-RUC-", ""), "nombre": t.get("name")}
            for t in tender.get("tenderers", [])
        ]

        # Ganador y adjudicacion
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
                    "telefono": p.get("contactPoint", {}).get("telephone")
                }
                break

        return {
            "ocid": compiled.get("ocid"),
            "tender_id": tender.get("id"),
            "nomenclatura": tender.get("title"),
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
            "postores": postores,
            "num_postores": len(postores),
            "ganador": ganador,
            "monto_adjudicado": monto_adjudicado,
            "contrato": contrato,
            "documentos": documentos,
            "num_documentos": len(documentos)
        }

    # ==================== EXPORTACION ====================

    def export_json(self, procesos: List[Dict], filename: str = None) -> str:
        """Exporta procesos a JSON"""
        if not filename:
            filename = f"ocds_export_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        filepath = OUTPUT_DIR / filename
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(procesos, f, ensure_ascii=False, indent=2)
        print(f"[OK] {filepath}")
        return str(filepath)

    def export_csv(self, procesos: List[Dict], prefix: str = "export") -> Dict[str, str]:
        """Exporta procesos a CSVs para Google Sheets"""
        import csv

        files = {}

        # Procesos principales
        proc_file = OUTPUT_DIR / f"{prefix}_procesos.csv"
        with open(proc_file, 'w', newline='', encoding='utf-8-sig') as f:
            w = csv.writer(f)
            w.writerow(['OCID', 'TENDER_ID', 'NOMENCLATURA', 'DESCRIPCION', 'TIPO',
                       'CATEGORIA', 'ENTIDAD', 'VALOR', 'MONEDA', 'FECHA_PUB',
                       'NUM_POSTORES', 'GANADOR', 'MONTO_ADJ', 'CONTRATO'])
            for p in procesos:
                w.writerow([
                    p.get('ocid'), p.get('tender_id'), p.get('nomenclatura'),
                    p.get('descripcion'), p.get('tipo_procedimiento'),
                    p.get('categoria'), p.get('entidad', {}).get('nombre'),
                    p.get('valor_referencial'), p.get('moneda'),
                    p.get('fecha_publicacion'), p.get('num_postores'),
                    p.get('ganador', {}).get('nombre') if p.get('ganador') else '',
                    p.get('monto_adjudicado'),
                    p.get('contrato', {}).get('numero') if p.get('contrato') else ''
                ])
        files['procesos'] = str(proc_file)

        # Postores
        post_file = OUTPUT_DIR / f"{prefix}_postores.csv"
        with open(post_file, 'w', newline='', encoding='utf-8-sig') as f:
            w = csv.writer(f)
            w.writerow(['NOMENCLATURA', 'RUC', 'NOMBRE', 'ES_GANADOR'])
            for p in procesos:
                ganador_ruc = p.get('ganador', {}).get('ruc', '') if p.get('ganador') else ''
                for postor in p.get('postores', []):
                    w.writerow([
                        p.get('nomenclatura'), postor.get('ruc'), postor.get('nombre'),
                        'SI' if postor.get('ruc') == ganador_ruc else 'NO'
                    ])
        files['postores'] = str(post_file)

        # Documentos
        doc_file = OUTPUT_DIR / f"{prefix}_documentos.csv"
        with open(doc_file, 'w', newline='', encoding='utf-8-sig') as f:
            w = csv.writer(f)
            w.writerow(['NOMENCLATURA', 'TITULO', 'TIPO', 'FORMATO', 'URL'])
            for p in procesos:
                for doc in p.get('documentos', []):
                    w.writerow([
                        p.get('nomenclatura'), doc.get('titulo'),
                        doc.get('tipo'), doc.get('formato'), doc.get('url')
                    ])
        files['documentos'] = str(doc_file)

        print(f"[OK] CSVs exportados: {list(files.keys())}")
        return files


# ==================== CLI ====================

def main():
    import argparse

    parser = argparse.ArgumentParser(description='SEACE OCDS Client')
    parser.add_argument('--ocid', help='Buscar por OCID')
    parser.add_argument('--tender-id', help='Buscar por tender ID')
    parser.add_argument('--nomenclatura', help='Buscar por nomenclatura')
    parser.add_argument('--year', type=int, help='Ano para descarga masiva')
    parser.add_argument('--month', type=int, help='Mes especifico')
    parser.add_argument('--filter', help='Filtro de texto (ej: ELSE)')
    parser.add_argument('--else', dest='else_mode', action='store_true', help='Buscar ELSE')
    parser.add_argument('--csv', action='store_true', help='Exportar a CSV')
    parser.add_argument('--output', help='Archivo de salida')

    args = parser.parse_args()
    client = SeaceOCDS()

    procesos = []

    if args.ocid:
        p = client.get_by_ocid(args.ocid)
        if p:
            procesos = [p]
            print(f"\nNomenclatura: {p['nomenclatura']}")
            print(f"Valor: {p['valor_referencial']:,.2f} {p['moneda']}")
            print(f"Postores: {p['num_postores']}")

    elif args.tender_id:
        p = client.get_by_tender_id(args.tender_id)
        if p:
            procesos = [p]
            print(f"\nNomenclatura: {p['nomenclatura']}")

    elif args.nomenclatura:
        p = client.get_by_nomenclatura(args.nomenclatura)
        if p:
            procesos = [p]
            print(f"\nEncontrado: {p['nomenclatura']}")

    elif args.else_mode and args.year:
        months = [args.month] if args.month else None
        procesos = client.search_else(args.year, months)
        print(f"\nTotal ELSE: {len(procesos)}")

    elif args.year:
        months = [args.month] if args.month else None
        procesos = client.download_year(args.year, filter_text=args.filter, months=months)
        print(f"\nTotal: {len(procesos)}")

    # Exportar
    if procesos:
        if args.csv:
            client.export_csv(procesos, args.output or "seace")
        else:
            client.export_json(procesos, args.output)


if __name__ == "__main__":
    main()
