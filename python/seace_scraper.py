"""
SEACE Web Scraper - Extrae datos de fichas de seleccion
"""
import time
import json
import hashlib
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict, List, Any

from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException, NoSuchElementException
from webdriver_manager.chrome import ChromeDriverManager
from bs4 import BeautifulSoup
import requests

from config import SEACE_CONFIG, CACHE_DIR, ETAPAS_MAPPING


class SeaceScraper:
    """Scraper para el portal SEACE"""

    def __init__(self, use_cache: bool = True, headless: bool = True):
        self.use_cache = use_cache
        self.headless = headless
        self.driver = None
        self.session = requests.Session()

    def _init_driver(self):
        """Inicializa el driver de Selenium"""
        if self.driver is not None:
            return

        options = Options()
        if self.headless:
            options.add_argument("--headless")
        options.add_argument("--no-sandbox")
        options.add_argument("--disable-dev-shm-usage")
        options.add_argument("--disable-gpu")
        options.add_argument("--window-size=1920,1080")
        options.add_argument("--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")

        service = Service(ChromeDriverManager().install())
        self.driver = webdriver.Chrome(service=service, options=options)
        self.driver.set_page_load_timeout(SEACE_CONFIG["PAGE_LOAD_TIMEOUT"])

    def _get_cache_path(self, nomenclatura: str) -> Path:
        """Genera path de cache para una nomenclatura"""
        hash_id = hashlib.md5(nomenclatura.encode()).hexdigest()[:8]
        return CACHE_DIR / f"{nomenclatura.replace('/', '-')}_{hash_id}.json"

    def _load_from_cache(self, nomenclatura: str) -> Optional[Dict]:
        """Carga datos desde cache si existe"""
        if not self.use_cache:
            return None

        cache_path = self._get_cache_path(nomenclatura)
        if cache_path.exists():
            with open(cache_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
                # Cache valido por 24 horas
                cache_time = datetime.fromisoformat(data.get('_cache_time', '2000-01-01'))
                if (datetime.now() - cache_time).days < 1:
                    return data
        return None

    def _save_to_cache(self, nomenclatura: str, data: Dict):
        """Guarda datos en cache"""
        if not self.use_cache:
            return

        data['_cache_time'] = datetime.now().isoformat()
        cache_path = self._get_cache_path(nomenclatura)
        with open(cache_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

    def buscar_proceso(self, nomenclatura: str) -> Optional[str]:
        """
        Busca un proceso por nomenclatura y retorna el ID de la ficha

        Returns:
            ID de la ficha (UUID) o None si no se encuentra
        """
        self._init_driver()

        try:
            # Ir al buscador
            self.driver.get(SEACE_CONFIG["BUSCADOR_URL"])
            time.sleep(2)

            # Expandir busqueda avanzada
            try:
                btn_avanzada = WebDriverWait(self.driver, 10).until(
                    EC.element_to_be_clickable((By.XPATH, "//a[contains(text(), 'Busqueda Avanzada')]"))
                )
                btn_avanzada.click()
                time.sleep(1)
            except:
                pass  # Ya puede estar expandida

            # Ingresar nomenclatura
            input_nomenclatura = WebDriverWait(self.driver, 10).until(
                EC.presence_of_element_located((By.XPATH, "//input[contains(@id, 'siglaNomenclatura')]"))
            )
            input_nomenclatura.clear()
            input_nomenclatura.send_keys(nomenclatura)

            # Click en buscar
            btn_buscar = self.driver.find_element(By.XPATH, "//button[contains(@id, 'btnBuscar')]")
            btn_buscar.click()

            # Esperar resultados
            time.sleep(3)

            # Buscar link a ficha de seleccion
            try:
                link_ficha = WebDriverWait(self.driver, 10).until(
                    EC.presence_of_element_located((By.XPATH, "//a[contains(@title, 'Ficha de Seleccion')]"))
                )
                href = link_ficha.get_attribute('href')

                # Extraer ID del href
                if 'id=' in href:
                    ficha_id = href.split('id=')[1].split('&')[0]
                    return ficha_id

            except TimeoutException:
                print(f"No se encontro ficha para: {nomenclatura}")
                return None

        except Exception as e:
            print(f"Error buscando {nomenclatura}: {e}")
            return None

        return None

    def extraer_ficha(self, ficha_id: str, nomenclatura: str = None) -> Dict[str, Any]:
        """
        Extrae todos los datos de una ficha de seleccion

        Args:
            ficha_id: UUID de la ficha
            nomenclatura: Nomenclatura del proceso (para cache)

        Returns:
            Diccionario con todos los datos extraidos
        """
        # Verificar cache
        if nomenclatura:
            cached = self._load_from_cache(nomenclatura)
            if cached:
                print(f"[CACHE] {nomenclatura}")
                return cached

        self._init_driver()

        datos = {
            "ficha_id": ficha_id,
            "nomenclatura": nomenclatura,
            "fecha_extraccion": datetime.now().isoformat(),
            "cronograma": [],
            "documentos": [],
            "info_general": {},
            "info_entidad": {},
            "info_procedimiento": {},
            "postores": [],
            "contrato": None,
            "error": None
        }

        try:
            # Cargar ficha
            url = f"{SEACE_CONFIG['FICHA_URL']}?id={ficha_id}&ptoRetorno=LOCAL"
            self.driver.get(url)
            time.sleep(3)

            # Esperar que cargue
            WebDriverWait(self.driver, 15).until(
                EC.presence_of_element_located((By.CLASS_NAME, "ui-panel"))
            )

            # Obtener HTML
            html = self.driver.page_source
            soup = BeautifulSoup(html, 'lxml')

            # Extraer informacion general
            datos["info_general"] = self._extraer_info_general(soup)

            # Extraer informacion de la entidad
            datos["info_entidad"] = self._extraer_info_entidad(soup)

            # Extraer informacion del procedimiento
            datos["info_procedimiento"] = self._extraer_info_procedimiento(soup)

            # Extraer cronograma
            datos["cronograma"] = self._extraer_cronograma(soup)

            # Extraer documentos
            datos["documentos"] = self._extraer_documentos(soup)

            # Intentar extraer postores (puede requerir click adicional)
            datos["postores"] = self._extraer_postores()

            # Guardar en cache
            if nomenclatura:
                self._save_to_cache(nomenclatura, datos)

            print(f"[OK] {nomenclatura or ficha_id}")

        except Exception as e:
            datos["error"] = str(e)
            print(f"[ERROR] {nomenclatura or ficha_id}: {e}")

        return datos

    def _extraer_info_general(self, soup: BeautifulSoup) -> Dict:
        """Extrae informacion general del proceso"""
        info = {}

        # Buscar tabla de informacion general
        panel = soup.find('div', string=lambda t: t and 'Informacion General' in t)
        if panel:
            panel = panel.find_parent('div', class_='ui-panel')

        if not panel:
            # Buscar de otra forma
            for div in soup.find_all('div', class_='ui-panel-title'):
                if 'Informacion General' in div.get_text():
                    panel = div.find_parent('div', class_='ui-panel')
                    break

        if panel:
            rows = panel.find_all('tr')
            for row in rows:
                cells = row.find_all(['td', 'th'])
                if len(cells) >= 2:
                    label = cells[0].get_text(strip=True).replace(':', '')
                    value = cells[1].get_text(strip=True)
                    if label and value:
                        info[label] = value

        return info

    def _extraer_info_entidad(self, soup: BeautifulSoup) -> Dict:
        """Extrae informacion de la entidad"""
        info = {}

        for div in soup.find_all('div', class_='ui-panel-title'):
            if 'Informacion general de la Entidad' in div.get_text():
                panel = div.find_parent('div', class_='ui-panel')
                if panel:
                    rows = panel.find_all('tr')
                    for row in rows:
                        cells = row.find_all(['td', 'th'])
                        if len(cells) >= 2:
                            label = cells[0].get_text(strip=True).replace(':', '')
                            value = cells[1].get_text(strip=True)
                            if label and value:
                                info[label] = value
                break

        return info

    def _extraer_info_procedimiento(self, soup: BeautifulSoup) -> Dict:
        """Extrae informacion del procedimiento"""
        info = {}

        for div in soup.find_all('div', class_='ui-panel-title'):
            if 'Informacion general del procedimiento' in div.get_text():
                panel = div.find_parent('div', class_='ui-panel')
                if panel:
                    rows = panel.find_all('tr')
                    for row in rows:
                        cells = row.find_all(['td', 'th'])
                        if len(cells) >= 2:
                            label = cells[0].get_text(strip=True).replace(':', '')
                            value = cells[1].get_text(strip=True)
                            if label and value:
                                info[label] = value
                break

        return info

    def _extraer_cronograma(self, soup: BeautifulSoup) -> List[Dict]:
        """Extrae el cronograma del proceso"""
        cronograma = []

        # Buscar panel de cronograma
        for div in soup.find_all('div', class_='ui-panel-title'):
            if 'Cronograma' in div.get_text():
                panel = div.find_parent('div', class_='ui-panel')
                if panel:
                    tabla = panel.find('table')
                    if tabla:
                        rows = tabla.find_all('tr')[1:]  # Saltar header
                        for row in rows:
                            cells = row.find_all('td')
                            if len(cells) >= 3:
                                etapa_raw = cells[0].get_text(strip=True)
                                fecha_inicio = cells[1].get_text(strip=True)
                                fecha_fin = cells[2].get_text(strip=True)

                                # Mapear nombre de etapa
                                etapa = ETAPAS_MAPPING.get(etapa_raw, etapa_raw)

                                cronograma.append({
                                    "etapa": etapa,
                                    "etapa_original": etapa_raw,
                                    "fecha_inicio": fecha_inicio,
                                    "fecha_fin": fecha_fin
                                })
                break

        return cronograma

    def _extraer_documentos(self, soup: BeautifulSoup) -> List[Dict]:
        """Extrae la lista de documentos"""
        documentos = []

        # Buscar tabla de documentos
        for div in soup.find_all('div', class_='ui-panel-title'):
            if 'Lista de Documentos' in div.get_text():
                panel = div.find_parent('div', class_='ui-panel')
                if panel:
                    tabla = panel.find('table')
                    if tabla:
                        rows = tabla.find_all('tr')[1:]  # Saltar header
                        for row in rows:
                            cells = row.find_all('td')
                            if len(cells) >= 5:
                                doc = {
                                    "numero": cells[0].get_text(strip=True),
                                    "etapa": cells[1].get_text(strip=True),
                                    "documento": cells[2].get_text(strip=True),
                                    "fecha": cells[4].get_text(strip=True) if len(cells) > 4 else ""
                                }

                                # Buscar link de descarga
                                link = cells[3].find('a') if len(cells) > 3 else None
                                if link:
                                    doc["url"] = link.get('href', '')

                                documentos.append(doc)
                break

        return documentos

    def _extraer_postores(self) -> List[Dict]:
        """Extrae la lista de postores (requiere interaccion)"""
        postores = []

        try:
            # Buscar boton "Ver Ofertas Presentadas"
            btn_ofertas = self.driver.find_element(
                By.XPATH,
                "//span[contains(text(), 'Ver Ofertas Presentadas')]"
            )
            btn_ofertas.click()
            time.sleep(2)

            # Extraer datos de ofertas
            html = self.driver.page_source
            soup = BeautifulSoup(html, 'lxml')

            # Buscar tabla de ofertas
            for tabla in soup.find_all('table'):
                headers = [th.get_text(strip=True) for th in tabla.find_all('th')]
                if 'Postor' in str(headers) or 'RUC' in str(headers):
                    rows = tabla.find_all('tr')[1:]
                    for row in rows:
                        cells = row.find_all('td')
                        if len(cells) >= 2:
                            postor = {
                                "ruc": cells[0].get_text(strip=True) if len(cells) > 0 else "",
                                "nombre": cells[1].get_text(strip=True) if len(cells) > 1 else "",
                                "monto": cells[2].get_text(strip=True) if len(cells) > 2 else ""
                            }
                            postores.append(postor)
                    break

            # Volver a la ficha
            self.driver.back()
            time.sleep(1)

        except Exception as e:
            pass  # Puede que no haya ofertas publicadas

        return postores

    def close(self):
        """Cierra el driver"""
        if self.driver:
            self.driver.quit()
            self.driver = None

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()


# ============== FUNCIONES DE ALTO NIVEL ==============

def scrape_proceso(nomenclatura: str, use_cache: bool = True) -> Dict:
    """
    Funcion principal para scrapear un proceso completo

    Args:
        nomenclatura: Nomenclatura del proceso (ej: "AS-SM-35-2024-ELSE-1")
        use_cache: Si usar cache local

    Returns:
        Diccionario con todos los datos del proceso
    """
    with SeaceScraper(use_cache=use_cache) as scraper:
        # Buscar ficha
        ficha_id = scraper.buscar_proceso(nomenclatura)

        if not ficha_id:
            return {
                "nomenclatura": nomenclatura,
                "error": "Proceso no encontrado",
                "success": False
            }

        # Extraer datos
        datos = scraper.extraer_ficha(ficha_id, nomenclatura)
        datos["success"] = datos.get("error") is None

        return datos


def scrape_multiples(nomenclaturas: List[str], use_cache: bool = True) -> List[Dict]:
    """
    Scrapea multiples procesos

    Args:
        nomenclaturas: Lista de nomenclaturas
        use_cache: Si usar cache local

    Returns:
        Lista de diccionarios con datos de cada proceso
    """
    resultados = []

    with SeaceScraper(use_cache=use_cache) as scraper:
        for i, nom in enumerate(nomenclaturas):
            print(f"\n[{i+1}/{len(nomenclaturas)}] Procesando: {nom}")

            ficha_id = scraper.buscar_proceso(nom)

            if ficha_id:
                datos = scraper.extraer_ficha(ficha_id, nom)
                datos["success"] = datos.get("error") is None
            else:
                datos = {
                    "nomenclatura": nom,
                    "error": "Proceso no encontrado",
                    "success": False
                }

            resultados.append(datos)

            # Rate limiting
            time.sleep(SEACE_CONFIG["REQUEST_DELAY"])

    return resultados


if __name__ == "__main__":
    # Test
    resultado = scrape_proceso("AS-SM-35-2024-ELSE-1")
    print(json.dumps(resultado, indent=2, ensure_ascii=False))
