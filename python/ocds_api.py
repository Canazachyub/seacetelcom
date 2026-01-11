"""
OCDS API Client - Extrae datos del Portal de Contrataciones Abiertas
URL: https://contratacionesabiertas.oece.gob.pe

ELSE SI ESTA en esta API!
"""
import requests
import json
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict, List, Any
from urllib.parse import quote

from config import OUTPUT_DIR, CACHE_DIR


class OCDSClient:
    """Cliente para la API OCDS de Peru"""

    BASE_URL = "https://contratacionesabiertas.oece.gob.pe/api/v1"

    def __init__(self, use_cache: bool = True):
        self.use_cache = use_cache
        self.session = requests.Session()
        self.session.headers.update({
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Accept": "application/json"
        })

    def _get_cache_path(self, key: str) -> Path:
        """Genera path de cache"""
        safe_key = key.replace("/", "-").replace(":", "-")
        return CACHE_DIR / f"ocds_{safe_key}.json"

    def _load_cache(self, key: str) -> Optional[Dict]:
        """Carga desde cache"""
        if not self.use_cache:
            return None
        cache_path = self._get_cache_path(key)
        if cache_path.exists():
            with open(cache_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
                # Cache valido por 1 hora
                cache_time = datetime.fromisoformat(data.get('_cache_time', '2000-01-01'))
                if (datetime.now() - cache_time).total_seconds() < 3600:
                    return data
        return None

    def _save_cache(self, key: str, data: Dict):
        """Guarda en cache"""
        if not self.use_cache:
            return
        data['_cache_time'] = datetime.now().isoformat()
        cache_path = self._get_cache_path(key)
        with open(cache_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

    def buscar_por_nomenclatura(self, nomenclatura: str) -> Optional[Dict]:
        """
        Busca un proceso por nomenclatura (ej: AS-SM-35-2024-ELSE-1)

        La nomenclatura esta en tender.title en la API OCDS
        """
        # Verificar cache
        cached = self._load_cache(f"nom_{nomenclatura}")
        if cached:
            print(f"[CACHE] {nomenclatura}")
            return cached

        # Buscar en API
        url = f"{self.BASE_URL}/records"
        params = {
            "tenderTitle": nomenclatura,
            "page": 1,
            "paginateBy": 10
        }

        try:
            response = self.session.get(url, params=params, timeout=30)
            response.raise_for_status()
            data = response.json()

            # Buscar el proceso exacto en los resultados
            records = data.get("records", [])
            for record in records:
                compiled = record.get("compiledRelease", {})
                tender = compiled.get("tender", {})
                if tender.get("title") == nomenclatura:
                    resultado = self._procesar_record(record)
                    self._save_cache(f"nom_{nomenclatura}", resultado)
                    print(f"[OK] {nomenclatura}")
                    return resultado

            # Si no encontro exacto, devolver el primero si existe
            if records:
                resultado = self._procesar_record(records[0])
                self._save_cache(f"nom_{nomenclatura}", resultado)
                print(f"[OK] {nomenclatura} (aproximado)")
                return resultado

            print(f"[NO ENCONTRADO] {nomenclatura}")
            return None

        except Exception as e:
            print(f"[ERROR] {nomenclatura}: {e}")
            return None

    def buscar_por_ocid(self, ocid: str) -> Optional[Dict]:
        """
        Busca un proceso por su OCID
        Ej: ocds-dgv273-seacev3-2024-2407-110
        """
        cached = self._load_cache(f"ocid_{ocid}")
        if cached:
            print(f"[CACHE] {ocid}")
            return cached

        url = f"{self.BASE_URL}/record/{ocid}"

        try:
            response = self.session.get(url, timeout=30)
            response.raise_for_status()
            data = response.json()

            records = data.get("records", [])
            if records:
                resultado = self._procesar_record(records[0])
                self._save_cache(f"ocid_{ocid}", resultado)
                print(f"[OK] {ocid}")
                return resultado

            return None

        except Exception as e:
            print(f"[ERROR] {ocid}: {e}")
            return None

    def buscar_por_entidad(self, nombre_entidad: str, anio: int = None, limite: int = 100) -> List[Dict]:
        """
        Busca procesos por nombre de entidad
        Ej: "ELECTRO SUR ESTE"
        """
        url = f"{self.BASE_URL}/records"
        params = {
            "buyerName": nombre_entidad,
            "page": 1,
            "paginateBy": limite
        }

        if anio:
            params["year"] = anio

        try:
            response = self.session.get(url, params=params, timeout=60)
            response.raise_for_status()
            data = response.json()

            resultados = []
            for record in data.get("records", []):
                resultados.append(self._procesar_record(record))

            print(f"[OK] {len(resultados)} procesos encontrados para {nombre_entidad}")
            return resultados

        except Exception as e:
            print(f"[ERROR] busqueda entidad: {e}")
            return []

    def _procesar_record(self, record: Dict) -> Dict:
        """Procesa un record OCDS y extrae datos relevantes"""
        compiled = record.get("compiledRelease", {})
        tender = compiled.get("tender", {})
        buyer = compiled.get("buyer", {})
        awards = compiled.get("awards", [])
        contracts = compiled.get("contracts", [])
        parties = compiled.get("parties", [])

        # Extraer documentos
        documentos = []
        for doc in tender.get("documents", []):
            documentos.append({
                "id": doc.get("id"),
                "titulo": doc.get("title"),
                "tipo": doc.get("documentType"),
                "formato": doc.get("format"),
                "url": doc.get("url"),
                "fecha": doc.get("datePublished")
            })

        # Agregar documentos de contratos
        for contrato in contracts:
            for doc in contrato.get("documents", []):
                documentos.append({
                    "id": doc.get("id"),
                    "titulo": doc.get("title", "Documento de contrato"),
                    "tipo": doc.get("documentType", "contractSigned"),
                    "formato": doc.get("format"),
                    "url": doc.get("url"),
                    "fecha": doc.get("datePublished")
                })

        # Extraer postores
        postores = []
        for tenderer in tender.get("tenderers", []):
            postores.append({
                "ruc": tenderer.get("id", "").replace("PE-RUC-", ""),
                "nombre": tenderer.get("name")
            })

        # Extraer ganador y adjudicacion
        ganador = None
        monto_adjudicado = None
        fecha_buena_pro = None

        if awards:
            award = awards[0]
            suppliers = award.get("suppliers", [])
            if suppliers:
                ganador = {
                    "ruc": suppliers[0].get("id", "").replace("PE-RUC-", ""),
                    "nombre": suppliers[0].get("name")
                }
            monto_adjudicado = award.get("value", {}).get("amount")
            fecha_buena_pro = award.get("date")

        # Extraer contrato
        contrato_info = None
        if contracts:
            c = contracts[0]
            contrato_info = {
                "numero": c.get("title"),
                "id": c.get("id"),
                "monto": c.get("value", {}).get("amount"),
                "fecha_firma": c.get("dateSigned"),
                "periodo_inicio": c.get("period", {}).get("startDate"),
                "periodo_fin": c.get("period", {}).get("endDate"),
                "duracion_dias": c.get("period", {}).get("durationInDays")
            }

        # Extraer info de entidad
        entidad_info = {}
        for party in parties:
            if "buyer" in party.get("roles", []):
                entidad_info = {
                    "nombre": party.get("name"),
                    "ruc": party.get("additionalIdentifiers", [{}])[0].get("id") if party.get("additionalIdentifiers") else None,
                    "direccion": party.get("address", {}).get("streetAddress"),
                    "departamento": party.get("address", {}).get("department"),
                    "region": party.get("address", {}).get("region"),
                    "telefono": party.get("contactPoint", {}).get("telephone")
                }
                break

        # Cronograma basico
        cronograma = {
            "convocatoria_inicio": tender.get("tenderPeriod", {}).get("startDate"),
            "convocatoria_fin": tender.get("tenderPeriod", {}).get("endDate"),
            "consultas_inicio": tender.get("enquiryPeriod", {}).get("startDate"),
            "consultas_fin": tender.get("enquiryPeriod", {}).get("endDate"),
            "buena_pro": fecha_buena_pro
        }

        return {
            "ocid": compiled.get("ocid"),
            "nomenclatura": tender.get("title"),
            "convocatoria_id": tender.get("id"),
            "descripcion": tender.get("description"),
            "tipo_procedimiento": tender.get("procurementMethodDetails"),
            "categoria": tender.get("mainProcurementCategory"),
            "valor_referencial": tender.get("value", {}).get("amount"),
            "moneda": tender.get("value", {}).get("currency"),
            "fecha_publicacion": tender.get("datePublished"),
            "entidad": entidad_info,
            "cronograma": cronograma,
            "postores": postores,
            "num_postores": len(postores),
            "ganador": ganador,
            "monto_adjudicado": monto_adjudicado,
            "contrato": contrato_info,
            "documentos": documentos,
            "num_documentos": len(documentos),
            "fuente": "OCDS_API",
            "fecha_extraccion": datetime.now().isoformat()
        }


# ============== FUNCIONES DE ALTO NIVEL ==============

def obtener_proceso(nomenclatura: str, use_cache: bool = True) -> Optional[Dict]:
    """
    Obtiene todos los datos de un proceso por nomenclatura

    Args:
        nomenclatura: Nomenclatura del proceso (ej: "AS-SM-35-2024-ELSE-1")

    Returns:
        Diccionario con todos los datos del proceso
    """
    client = OCDSClient(use_cache=use_cache)
    return client.buscar_por_nomenclatura(nomenclatura)


def obtener_procesos_else(anio: int = None, limite: int = 100) -> List[Dict]:
    """
    Obtiene todos los procesos de ELECTRO SUR ESTE

    Args:
        anio: Año a filtrar (opcional)
        limite: Maximo de resultados

    Returns:
        Lista de procesos
    """
    client = OCDSClient(use_cache=True)
    return client.buscar_por_entidad("ELECTRO SUR ESTE", anio=anio, limite=limite)


def guardar_resultados(procesos: List[Dict], filename: str = None) -> str:
    """Guarda resultados en JSON"""
    if filename is None:
        filename = f"procesos_ocds_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"

    filepath = OUTPUT_DIR / filename
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(procesos, f, ensure_ascii=False, indent=2)

    print(f"[OK] Guardado en: {filepath}")
    return str(filepath)


if __name__ == "__main__":
    # Test: buscar AS-SM-35-2024-ELSE-1
    print("=" * 60)
    print("TEST: OCDS API Client")
    print("=" * 60)

    proceso = obtener_proceso("AS-SM-35-2024-ELSE-1")

    if proceso:
        print(f"\n{'='*60}")
        print(f"Nomenclatura: {proceso['nomenclatura']}")
        print(f"Descripcion: {proceso['descripcion']}")
        print(f"Valor Ref: {proceso['valor_referencial']:,.2f} {proceso['moneda']}")
        print(f"Postores: {proceso['num_postores']}")
        print(f"Ganador: {proceso['ganador']['nombre'] if proceso['ganador'] else 'N/A'}")
        print(f"Monto Adj: {proceso['monto_adjudicado']:,.2f}" if proceso['monto_adjudicado'] else "")
        print(f"Contrato: {proceso['contrato']['numero'] if proceso['contrato'] else 'N/A'}")
        print(f"Documentos: {proceso['num_documentos']}")
        print(f"\nPostores:")
        for p in proceso['postores'][:5]:
            print(f"  - {p['nombre']}")
        print(f"\nDocumentos:")
        for d in proceso['documentos'][:5]:
            print(f"  - {d['titulo']} ({d['formato']})")

        # Guardar
        guardar_resultados([proceso], "test_proceso.json")
    else:
        print("Proceso no encontrado")
