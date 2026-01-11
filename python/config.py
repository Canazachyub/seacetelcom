"""
Configuracion del sistema SEACE Scraper
"""
import os
from pathlib import Path

# Rutas
BASE_DIR = Path(__file__).parent.parent
DATA_DIR = BASE_DIR / "data"
INPUT_DIR = DATA_DIR / "input"
OUTPUT_DIR = DATA_DIR / "output"
CACHE_DIR = DATA_DIR / "cache"
LOGS_DIR = BASE_DIR / "logs"

# Crear directorios si no existen
for dir in [INPUT_DIR, OUTPUT_DIR, CACHE_DIR, LOGS_DIR]:
    dir.mkdir(parents=True, exist_ok=True)

# URLs SEACE
SEACE_CONFIG = {
    "BASE_URL": "https://prod2.seace.gob.pe",
    "BUSCADOR_URL": "https://prod2.seace.gob.pe/seacebus-uiwd-pub/buscadorPublico/buscadorPublico.xhtml",
    "FICHA_URL": "https://prod2.seace.gob.pe/seacebus-uiwd-pub/fichaSeleccion/fichaSeleccion.xhtml",

    # Rate limiting
    "REQUEST_DELAY": 2,  # segundos entre requests
    "MAX_RETRIES": 3,

    # Timeouts
    "PAGE_LOAD_TIMEOUT": 30,
    "REQUEST_TIMEOUT": 15,
}

# Google Sheets
SHEETS_CONFIG = {
    "CREDENTIALS_FILE": BASE_DIR / "credentials.json",
    "SPREADSHEET_NAME": "SEACE_INTELLIGENCE",
    "SHEETS": {
        "BD_PROCESOS": "BD_PROCESOS",
        "CRONOGRAMA": "CRONOGRAMA",
        "DOCUMENTOS": "DOCUMENTOS",
        "DATOS_SEACE": "DATOS_SEACE"
    }
}

# Mapeo de etapas SEACE a nombres internos
ETAPAS_MAPPING = {
    "Convocatoria": "CONVOCATORIA",
    "Registro de participantes(Electronica)": "REGISTRO_PARTICIPANTES",
    "Formulacion de consultas y observaciones(Electronica)": "CONSULTAS_OBSERVACIONES",
    "Absolucion de consultas y observaciones(Electronica)": "ABSOLUCION_CONSULTAS",
    "Integracion de las Bases": "INTEGRACION_BASES",
    "Presentacion de ofertas(Electronica)": "PRESENTACION_PROPUESTAS",
    "Evaluacion y calificacion": "CALIFICACION_EVALUACION",
    "Otorgamiento de la Buena Pro": "BUENA_PRO"
}
