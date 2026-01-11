"""
OCDS Client - Cliente completo para el Portal de Contrataciones Abiertas

Metodos de acceso:
1. API /record/{ocid} - Funciona si tienes el OCID
2. Web search + API - Selenium busca, API descarga
3. Procesar JSONs descargados manualmente
"""
import requests
import json
import time
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict, List, Any

# Para web search
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from webdriver_manager.chrome import ChromeDriverManager

from config import OUTPUT_DIR, CACHE_DIR


class OCDSClient:
    """Cliente para el Portal de Contrataciones Abiertas de Peru"""

    BASE_URL = "https://contratacionesabiertas.oece.gob.pe"
    API_URL = f"{BASE_URL}/api/v1"

    def __init__(self, use_cache: bool = True):
        self.use_cache = use_cache
        self.session = requests.Session()
        self.session.headers.update({
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Accept": "application/json"
        })
        self.driver = None

    def _get_cache_path(self, key: str) -> Path:
        """Genera path de cache"""
        safe_key = "".join(c if c.isalnum() or c in "-_" else "_" for c in key)
        return CACHE_DIR / f"ocds_{safe_key}.json"

    def _load_cache(self, key: str) -> Optional[Dict]:
        """Carga desde cache"""
        if not self.use_cache:
            return None
        cache_path = self._get_cache_path(key)
        if cache_path.exists():
            with open(cache_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        return None

    def _save_cache(self, key: str, data: Dict):
        """Guarda en cache"""
        if not self.use_cache:
            return
        cache_path = self._get_cache_path(key)
        with open(cache_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

    # ============== METODO 1: API DIRECTA ==============

    def get_by_ocid(self, ocid: str) -> Optional[Dict]:
        """
        Obtiene proceso por OCID usando la API directa

        Args:
            ocid: Ej: "ocds-dgv273-seacev3-2024-2407-110"

        Returns:
            Datos procesados del proceso
        """
        cached = self._load_cache(f"ocid_{ocid}")
        if cached:
            print(f"[CACHE] {ocid}")
            return cached

        url = f"{self.API_URL}/record/{ocid}"

        try:
            response = self.session.get(url, timeout=30)
            if response.status_code == 200:
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

    # ============== METODO 2: WEB SEARCH + API ==============

    def _init_driver(self):
        """Inicializa Selenium"""
        if self.driver:
            return

        options = Options()
        options.add_argument("--headless")
        options.add_argument("--no-sandbox")
        options.add_argument("--disable-dev-shm-usage")
        options.add_argument("--disable-gpu")
        options.add_argument("--window-size=1920,1080")

        service = Service(ChromeDriverManager().install())
        self.driver = webdriver.Chrome(service=service, options=options)

    def search_web(self, query: str, max_results: int = 10) -> List[str]:
        """
        Busca en el portal web y retorna lista de OCIDs

        Args:
            query: Termino de busqueda (nomenclatura, entidad, etc)
            max_results: Maximo de OCIDs a retornar

        Returns:
            Lista de OCIDs encontrados
        """
        self._init_driver()
        ocids = []

        try:
            url = f"{self.BASE_URL}/busqueda?search={query}&page=1&paginateBy={max_results}"
            self.driver.get(url)
            time.sleep(3)

            # Esperar que carguen resultados
            WebDriverWait(self.driver, 15).until(
                EC.presence_of_element_located((By.CSS_SELECTOR, "a[href*='/proceso/ocds-']"))
            )

            # Extraer OCIDs de los links
            links = self.driver.find_elements(By.CSS_SELECTOR, "a[href*='/proceso/ocds-']")
            for link in links[:max_results]:
                href = link.get_attribute("href")
                if "/proceso/" in href:
                    ocid = href.split("/proceso/")[1].split("?")[0]
                    if ocid not in ocids:
                        ocids.append(ocid)

            print(f"[BUSQUEDA] '{query}' -> {len(ocids)} OCIDs encontrados")

        except Exception as e:
            print(f"[ERROR] Busqueda web: {e}")

        return ocids

    def buscar_nomenclatura(self, nomenclatura: str) -> Optional[Dict]:
        """
        Busca proceso por nomenclatura usando web search + API

        Args:
            nomenclatura: Ej: "AS-SM-35-2024-ELSE-1"

        Returns:
            Datos del proceso o None
        """
        # Verificar cache primero
        cached = self._load_cache(f"nom_{nomenclatura}")
        if cached:
            print(f"[CACHE] {nomenclatura}")
            return cached

        # Buscar OCID via web
        ocids = self.search_web(nomenclatura, max_results=5)

        # Buscar el OCID que corresponde
        for ocid in ocids:
            datos = self.get_by_ocid(ocid)
            if datos and datos.get("nomenclatura") == nomenclatura:
                self._save_cache(f"nom_{nomenclatura}", datos)
                return datos

        # Si no encontro exacto, devolver el primero
        if ocids:
            datos = self.get_by_ocid(ocids[0])
            if datos:
                self._save_cache(f"nom_{nomenclatura}", datos)
            return datos

        return None

    def buscar_entidad(self, nombre_entidad: str, max_results: int = 50) -> List[Dict]:
        """
        Busca todos los procesos de una entidad

        Args:
            nombre_entidad: Ej: "ELECTRO SUR ESTE"
            max_results: Maximo de resultados

        Returns:
            Lista de procesos
        """
        ocids = self.search_web(nombre_entidad, max_results=max_results)

        resultados = []
        for i, ocid in enumerate(ocids):
            print(f"[{i+1}/{len(ocids)}] Descargando {ocid}...")
            datos = self.get_by_ocid(ocid)
            if datos:
                resultados.append(datos)
            time.sleep(0.5)  # Rate limiting

        return resultados

    # ============== METODO 3: PROCESAR JSON DESCARGADO ==============

    def procesar_json_descargado(self, filepath: str) -> Optional[Dict]:
        """
        Procesa un archivo JSON descargado manualmente del portal

        Args:
            filepath: Ruta al archivo JSON

        Returns:
            Datos procesados
        """
        with open(filepath, 'r', encoding='utf-8') as f:
            data = json.load(f)

        records = data.get("records", [])
        if records:
            return self._procesar_record(records[0])
        return None

    def procesar_carpeta_jsons(self, folder: str) -> List[Dict]:
        """
        Procesa todos los JSONs en una carpeta

        Args:
            folder: Ruta a la carpeta

        Returns:
            Lista de procesos procesados
        """
        resultados = []
        folder_path = Path(folder)

        for json_file in folder_path.glob("*.json"):
            print(f"Procesando: {json_file.name}")
            datos = self.procesar_json_descargado(str(json_file))
            if datos:
                resultados.append(datos)

        return resultados

    # ============== PROCESAMIENTO DE DATOS ==============

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

        # Documentos de contratos
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

        # Ganador y adjudicacion
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

        # Contrato
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

        # Info entidad
        entidad_info = {}
        for party in parties:
            if "buyer" in party.get("roles", []):
                addr = party.get("additionalIdentifiers", [{}])
                entidad_info = {
                    "nombre": party.get("name"),
                    "ruc": addr[0].get("id") if addr else None,
                    "direccion": party.get("address", {}).get("streetAddress"),
                    "departamento": party.get("address", {}).get("department"),
                    "region": party.get("address", {}).get("region"),
                    "telefono": party.get("contactPoint", {}).get("telephone")
                }
                break

        # Cronograma
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

    def close(self):
        """Cierra recursos"""
        if self.driver:
            self.driver.quit()
            self.driver = None

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.close()


# ============== FUNCIONES CONVENIENTES ==============

def procesar_json(filepath: str) -> Dict:
    """Procesa un JSON descargado del portal"""
    client = OCDSClient()
    return client.procesar_json_descargado(filepath)


def buscar_proceso(nomenclatura: str) -> Optional[Dict]:
    """Busca un proceso por nomenclatura"""
    with OCDSClient() as client:
        return client.buscar_nomenclatura(nomenclatura)


def buscar_else(max_results: int = 50) -> List[Dict]:
    """Busca todos los procesos de ELECTRO SUR ESTE"""
    with OCDSClient() as client:
        return client.buscar_entidad("ELECTRO SUR ESTE", max_results)


def guardar_json(datos: Any, filename: str = None) -> str:
    """Guarda datos en JSON"""
    if filename is None:
        filename = f"ocds_export_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    filepath = OUTPUT_DIR / filename
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(datos, f, ensure_ascii=False, indent=2)
    return str(filepath)


if __name__ == "__main__":
    print("=" * 60)
    print("TEST: OCDS Client")
    print("=" * 60)

    # Test 1: Procesar el JSON que ya descargaste
    json_path = Path(__file__).parent.parent / "json descargado.json"
    if json_path.exists():
        print(f"\n[1] Procesando JSON descargado...")
        datos = procesar_json(str(json_path))
        if datos:
            print(f"    Nomenclatura: {datos['nomenclatura']}")
            print(f"    Descripcion: {datos['descripcion']}")
            print(f"    Valor: {datos['valor_referencial']:,.2f} {datos['moneda']}")
            print(f"    Postores: {datos['num_postores']}")
            print(f"    Ganador: {datos['ganador']['nombre'] if datos['ganador'] else 'N/A'}")
            print(f"    Contrato: {datos['contrato']['numero'] if datos['contrato'] else 'N/A'}")
            print(f"    Documentos: {datos['num_documentos']}")

            # Guardar procesado
            output = guardar_json(datos, "proceso_AS-SM-35-2024-ELSE-1.json")
            print(f"\n    Guardado en: {output}")
    else:
        print(f"\n[1] JSON no encontrado en: {json_path}")

    # Test 2: Buscar por OCID directo
    print(f"\n[2] Buscando por OCID...")
    client = OCDSClient()
    datos = client.get_by_ocid("ocds-dgv273-seacev3-2024-2407-110")
    if datos:
        print(f"    Nomenclatura: {datos['nomenclatura']}")
