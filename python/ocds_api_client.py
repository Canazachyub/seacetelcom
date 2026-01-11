"""
OCDS API Client - Cliente para la API de Contrataciones Abiertas

Endpoints funcionales:
- /record/{ocid} - Obtener por OCID
- /record/{sourceId}/{tenderId} - Obtener por source y tenderId
- /records?tenderId=X&sourceId=Y - Buscar por tenderId
- /records?dataSegmentationID=YYYY-MM - Paginar por mes

Endpoint NO funcional:
- /records?tenderTitle=X - NO retorna resultados para algunas entidades

Estrategia: Usar dataSegmentationID para paginar y filtrar por entidad/nomenclatura
"""
import requests
import json
import time
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict, List, Any

import sys
sys.path.insert(0, str(Path(__file__).parent))
from config import OUTPUT_DIR, CACHE_DIR


class OCDSApiClient:
    """Cliente para la API OCDS de Peru"""

    BASE_URL = "https://contratacionesabiertas.oece.gob.pe/api/v1"

    def __init__(self, use_cache: bool = True):
        self.use_cache = use_cache
        self.session = requests.Session()
        self.session.headers.update({
            "User-Agent": "SEACE-Client/1.0",
            "Accept": "application/json"
        })

    # ========== METODOS DIRECTOS ==========

    def get_by_ocid(self, ocid: str) -> Optional[Dict]:
        """
        Obtiene un proceso por su OCID

        Args:
            ocid: ej "ocds-dgv273-seacev3-2024-2407-110"

        Returns:
            Record procesado o None
        """
        url = f"{self.BASE_URL}/record/{ocid}"
        try:
            r = self.session.get(url, timeout=30)
            if r.status_code == 200:
                data = r.json()
                records = data.get("records", [])
                if records:
                    return self._process_record(records[0])
        except Exception as e:
            print(f"[ERROR] get_by_ocid: {e}")
        return None

    def get_by_tender_id(self, tender_id: str, source: str = "seace_v3") -> Optional[Dict]:
        """
        Obtiene un proceso por su tender ID (ID de convocatoria)

        Args:
            tender_id: ej "1009388"
            source: "seace_v3" o "seace_v2"

        Returns:
            Record procesado o None
        """
        url = f"{self.BASE_URL}/record/{source}/{tender_id}"
        try:
            r = self.session.get(url, timeout=30)
            if r.status_code == 200:
                data = r.json()
                records = data.get("records", [])
                if records:
                    return self._process_record(records[0])
        except Exception as e:
            print(f"[ERROR] get_by_tender_id: {e}")
        return None

    # ========== BUSQUEDA POR MES ==========

    def search_by_month(
        self,
        year: int,
        month: int,
        source: str = "seace_v3",
        filter_entity: str = None,
        filter_nomenclatura: str = None,
        max_pages: int = 100
    ) -> List[Dict]:
        """
        Busca procesos por mes usando dataSegmentationID

        Args:
            year: Ano (ej: 2024)
            month: Mes (1-12)
            source: "seace_v3" o "seace_v2"
            filter_entity: Filtrar por nombre de entidad (ej: "ELECTRO SUR ESTE")
            filter_nomenclatura: Filtrar por parte de nomenclatura (ej: "ELSE")
            max_pages: Maximo de paginas a recorrer

        Returns:
            Lista de records procesados
        """
        data_seg = f"{year}-{month:02d}"
        results = []
        page = 1

        print(f"[API] Buscando {data_seg}...")

        while page <= max_pages:
            params = {
                "dataSegmentationID": data_seg,
                "sourceId": source,
                "page": page
            }

            try:
                r = self.session.get(f"{self.BASE_URL}/records", params=params, timeout=60)
                if r.status_code != 200:
                    break

                data = r.json()
                records = data.get("records", [])

                if not records:
                    break

                # Filtrar
                for record in records:
                    compiled = record.get("compiledRelease", {})
                    buyer = compiled.get("buyer", {})
                    tender = compiled.get("tender", {})

                    buyer_name = str(buyer.get("name", "")).upper()
                    tender_title = str(tender.get("title", "")).upper()

                    # Aplicar filtros
                    include = True
                    if filter_entity:
                        include = filter_entity.upper() in buyer_name
                    if include and filter_nomenclatura:
                        include = filter_nomenclatura.upper() in tender_title

                    if include:
                        processed = self._process_record(record)
                        results.append(processed)

                print(f"  Pagina {page}: {len(records)} records, {len(results)} filtrados")
                page += 1

                # Rate limiting
                time.sleep(0.5)

            except Exception as e:
                print(f"[ERROR] Pagina {page}: {e}")
                break

        return results

    def search_else(self, year: int, months: List[int] = None) -> List[Dict]:
        """
        Busca todos los procesos de ELECTRO SUR ESTE

        Args:
            year: Ano
            months: Lista de meses (None = todos)

        Returns:
            Lista de procesos
        """
        if months is None:
            months = list(range(1, 13))

        all_results = []

        for month in months:
            results = self.search_by_month(
                year=year,
                month=month,
                filter_nomenclatura="ELSE"
            )
            all_results.extend(results)
            print(f"  {year}-{month:02d}: {len(results)} procesos ELSE")

        return all_results

    # ========== BUSQUEDA POR NOMENCLATURA ==========

    def find_by_nomenclatura(self, nomenclatura: str, year: int = None, month: int = None) -> Optional[Dict]:
        """
        Busca un proceso especifico por nomenclatura

        Args:
            nomenclatura: ej "AS-SM-35-2024-ELSE-1"
            year: Ano (se extrae de nomenclatura si no se da)
            month: Mes (requerido si no esta en cache)

        Returns:
            Record procesado o None
        """
        # Extraer ano de nomenclatura si no se proporciona
        if year is None:
            parts = nomenclatura.split("-")
            for p in parts:
                if p.isdigit() and len(p) == 4 and p.startswith("20"):
                    year = int(p)
                    break

        if year is None:
            print(f"[ERROR] No se pudo determinar el ano de: {nomenclatura}")
            return None

        # Si no hay mes, buscar en todo el ano
        if month is None:
            months = list(range(1, 13))
        else:
            months = [month]

        for m in months:
            results = self.search_by_month(
                year=year,
                month=m,
                filter_nomenclatura=nomenclatura.split("-")[-2] if "-" in nomenclatura else nomenclatura
            )

            for r in results:
                if r.get("nomenclatura") == nomenclatura:
                    return r

        return None

    # ========== PROCESAMIENTO ==========

    def _process_record(self, record: Dict) -> Dict:
        """Procesa un record OCDS y extrae datos relevantes"""
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
        postores = []
        for t in tender.get("tenderers", []):
            postores.append({
                "ruc": t.get("id", "").replace("PE-RUC-", ""),
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
            "num_documentos": len(documentos),
            "fuente": "OCDS_API"
        }


def main():
    """Test del cliente API"""
    print("=" * 60)
    print("TEST: OCDS API Client")
    print("=" * 60)

    client = OCDSApiClient()

    # Test 1: Buscar por OCID
    print("\n[1] Buscar por OCID")
    proceso = client.get_by_ocid("ocds-dgv273-seacev3-2024-2407-110")
    if proceso:
        print(f"    Nomenclatura: {proceso['nomenclatura']}")
        print(f"    Valor: {proceso['valor_referencial']:,.2f} {proceso['moneda']}")
        print(f"    Postores: {proceso['num_postores']}")

    # Test 2: Buscar por tender_id
    print("\n[2] Buscar por tender_id")
    proceso = client.get_by_tender_id("1009388")
    if proceso:
        print(f"    Nomenclatura: {proceso['nomenclatura']}")

    # Test 3: Buscar ELSE en diciembre 2024
    print("\n[3] Buscar ELSE en diciembre 2024")
    procesos = client.search_by_month(
        year=2024,
        month=12,
        filter_nomenclatura="ELSE"
    )
    print(f"    Total: {len(procesos)} procesos")

    if procesos:
        # Guardar resultados
        output = OUTPUT_DIR / "api_else_dic2024.json"
        with open(output, 'w', encoding='utf-8') as f:
            json.dump(procesos, f, ensure_ascii=False, indent=2)
        print(f"    Guardado en: {output}")


if __name__ == "__main__":
    main()
