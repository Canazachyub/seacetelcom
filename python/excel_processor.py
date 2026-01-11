"""
Procesador de archivos Excel exportados desde SEACE
"""
import pandas as pd
from pathlib import Path
from typing import List, Dict, Optional
from datetime import datetime
import re

from config import INPUT_DIR, OUTPUT_DIR


class ExcelProcessor:
    """Procesa archivos Excel exportados del buscador SEACE"""

    # Mapeo de columnas del Excel SEACE a nombres internos
    COLUMN_MAPPING = {
        'N': 'numero',
        'Nombre o Sigla de la Entidad': 'entidad',
        'Fecha y Hora de Publicacion': 'fecha_publicacion',
        'Nomenclatura': 'nomenclatura',
        'Reiniciado Desde': 'reiniciado_desde',
        'Objeto de Contratacion': 'objeto',
        'Descripcion de Objeto': 'descripcion',
        'VR / VE / Cuantia de la contratacion': 'valor',
        'Moneda': 'moneda',
        'Version SEACE': 'version_seace'
    }

    def __init__(self):
        self.df = None

    def cargar_excel(self, filepath: str) -> pd.DataFrame:
        """
        Carga un archivo Excel exportado de SEACE

        Args:
            filepath: Ruta al archivo Excel

        Returns:
            DataFrame con los datos procesados
        """
        filepath = Path(filepath)

        if not filepath.exists():
            raise FileNotFoundError(f"Archivo no encontrado: {filepath}")

        # Cargar Excel
        if filepath.suffix == '.csv':
            self.df = pd.read_csv(filepath, encoding='utf-8')
        else:
            self.df = pd.read_excel(filepath)

        # Renombrar columnas
        self.df = self.df.rename(columns=self.COLUMN_MAPPING)

        # Procesar datos
        self._procesar_datos()

        return self.df

    def _procesar_datos(self):
        """Procesa y limpia los datos del DataFrame"""
        if self.df is None:
            return

        # Limpiar nomenclatura
        if 'nomenclatura' in self.df.columns:
            self.df['nomenclatura'] = self.df['nomenclatura'].str.strip()

        # Procesar fecha
        if 'fecha_publicacion' in self.df.columns:
            self.df['fecha_publicacion_dt'] = pd.to_datetime(
                self.df['fecha_publicacion'],
                format='%d/%m/%Y %H:%M',
                errors='coerce'
            )
            self.df['fecha_publicacion_iso'] = self.df['fecha_publicacion_dt'].dt.strftime('%Y-%m-%d')
            self.df['anio'] = self.df['fecha_publicacion_dt'].dt.year
            self.df['mes'] = self.df['fecha_publicacion_dt'].dt.month

        # Procesar valor
        if 'valor' in self.df.columns:
            self.df['valor_numerico'] = self.df['valor'].apply(self._parsear_valor)

        # Procesar moneda
        if 'moneda' in self.df.columns:
            self.df['moneda_codigo'] = self.df['moneda'].apply(self._normalizar_moneda)

        # Extraer componentes de nomenclatura
        if 'nomenclatura' in self.df.columns:
            self.df = self._extraer_componentes_nomenclatura(self.df)

        # Detectar region
        if 'entidad' in self.df.columns:
            self.df['region'] = self.df['entidad'].apply(self._detectar_region)

    def _parsear_valor(self, valor) -> float:
        """Convierte string de valor a numero"""
        if pd.isna(valor):
            return 0.0
        if isinstance(valor, (int, float)):
            return float(valor)
        # Quitar separadores de miles y convertir
        valor_str = str(valor).replace(',', '').replace(' ', '')
        try:
            return float(valor_str)
        except:
            return 0.0

    def _normalizar_moneda(self, moneda) -> str:
        """Normaliza codigo de moneda"""
        if pd.isna(moneda):
            return 'PEN'
        moneda_upper = str(moneda).upper()
        if 'DOLAR' in moneda_upper or 'USD' in moneda_upper:
            return 'USD'
        if 'EURO' in moneda_upper or 'EUR' in moneda_upper:
            return 'EUR'
        return 'PEN'

    def _extraer_componentes_nomenclatura(self, df: pd.DataFrame) -> pd.DataFrame:
        """Extrae componentes de la nomenclatura"""
        def extraer(nom):
            if pd.isna(nom):
                return pd.Series({
                    'tipo_proceso': None,
                    'modalidad': None,
                    'numero_proceso': None,
                    'anio_proceso': None,
                    'sigla_entidad': None,
                    'version': None
                })

            partes = str(nom).split('-')

            # Buscar anio (4 digitos que empiezan con 20)
            anio = None
            for p in partes:
                if re.match(r'^20\d{2}$', p):
                    anio = p
                    break

            return pd.Series({
                'tipo_proceso': partes[0] if len(partes) > 0 else None,
                'modalidad': partes[1] if len(partes) > 1 else None,
                'numero_proceso': partes[2] if len(partes) > 2 else None,
                'anio_proceso': anio,
                'sigla_entidad': partes[4] if len(partes) > 4 else None,
                'version': partes[5] if len(partes) > 5 else '1'
            })

        componentes = df['nomenclatura'].apply(extraer)
        return pd.concat([df, componentes], axis=1)

    def _detectar_region(self, entidad) -> str:
        """Detecta la region basandose en el nombre de la entidad"""
        if pd.isna(entidad):
            return 'LIMA'

        entidad_upper = str(entidad).upper()

        regiones = {
            'AMAZONAS': ['AMAZONAS', 'CHACHAPOYAS', 'BAGUA'],
            'ANCASH': ['ANCASH', 'HUARAZ', 'CHIMBOTE'],
            'APURIMAC': ['APURIMAC', 'ABANCAY', 'ANDAHUAYLAS'],
            'AREQUIPA': ['AREQUIPA', 'ELECTROSUR', 'SEAL'],
            'AYACUCHO': ['AYACUCHO', 'HUAMANGA'],
            'CAJAMARCA': ['CAJAMARCA', 'JAEN'],
            'CALLAO': ['CALLAO'],
            'CUSCO': ['CUSCO', 'ELECTRO SUR ESTE'],
            'HUANCAVELICA': ['HUANCAVELICA'],
            'HUANUCO': ['HUANUCO'],
            'ICA': ['ICA', 'NAZCA', 'PISCO'],
            'JUNIN': ['JUNIN', 'HUANCAYO'],
            'LA LIBERTAD': ['LA LIBERTAD', 'TRUJILLO', 'HIDRANDINA'],
            'LAMBAYEQUE': ['LAMBAYEQUE', 'CHICLAYO'],
            'LIMA': ['LIMA', 'MINISTERIO', 'SEDAPAL'],
            'LORETO': ['LORETO', 'IQUITOS'],
            'MADRE DE DIOS': ['MADRE DE DIOS', 'PUERTO MALDONADO'],
            'MOQUEGUA': ['MOQUEGUA', 'ILO'],
            'PASCO': ['PASCO'],
            'PIURA': ['PIURA', 'ENOSA', 'SULLANA'],
            'PUNO': ['PUNO', 'JULIACA'],
            'SAN MARTIN': ['SAN MARTIN', 'TARAPOTO'],
            'TACNA': ['TACNA'],
            'TUMBES': ['TUMBES'],
            'UCAYALI': ['UCAYALI', 'PUCALLPA']
        }

        for region, patrones in regiones.items():
            for patron in patrones:
                if patron in entidad_upper:
                    return region

        return 'LIMA'

    def get_nomenclaturas(self) -> List[str]:
        """Retorna lista de nomenclaturas unicas"""
        if self.df is None:
            return []
        return self.df['nomenclatura'].dropna().unique().tolist()

    def filtrar(
        self,
        entidad: str = None,
        anio: int = None,
        tipo_proceso: str = None,
        valor_min: float = None,
        valor_max: float = None
    ) -> pd.DataFrame:
        """Filtra el DataFrame por criterios"""
        if self.df is None:
            return pd.DataFrame()

        df_filtrado = self.df.copy()

        if entidad:
            df_filtrado = df_filtrado[
                df_filtrado['entidad'].str.contains(entidad, case=False, na=False)
            ]

        if anio:
            df_filtrado = df_filtrado[df_filtrado['anio'] == anio]

        if tipo_proceso:
            df_filtrado = df_filtrado[df_filtrado['tipo_proceso'] == tipo_proceso]

        if valor_min is not None:
            df_filtrado = df_filtrado[df_filtrado['valor_numerico'] >= valor_min]

        if valor_max is not None:
            df_filtrado = df_filtrado[df_filtrado['valor_numerico'] <= valor_max]

        return df_filtrado

    def exportar_json(self, filepath: str = None) -> str:
        """Exporta los datos a JSON"""
        if self.df is None:
            return "{}"

        if filepath:
            filepath = Path(filepath)
        else:
            filepath = OUTPUT_DIR / f"procesos_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"

        # Convertir a lista de diccionarios
        records = self.df.to_dict(orient='records')

        import json
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(records, f, ensure_ascii=False, indent=2, default=str)

        return str(filepath)

    def resumen(self) -> Dict:
        """Genera resumen estadistico de los datos"""
        if self.df is None:
            return {}

        return {
            "total_procesos": len(self.df),
            "por_tipo": self.df['tipo_proceso'].value_counts().to_dict() if 'tipo_proceso' in self.df.columns else {},
            "por_anio": self.df['anio'].value_counts().to_dict() if 'anio' in self.df.columns else {},
            "por_region": self.df['region'].value_counts().to_dict() if 'region' in self.df.columns else {},
            "valor_total": self.df['valor_numerico'].sum() if 'valor_numerico' in self.df.columns else 0,
            "valor_promedio": self.df['valor_numerico'].mean() if 'valor_numerico' in self.df.columns else 0,
            "entidades_unicas": self.df['entidad'].nunique() if 'entidad' in self.df.columns else 0
        }


def procesar_archivo(filepath: str) -> Dict:
    """
    Funcion conveniente para procesar un archivo Excel

    Args:
        filepath: Ruta al archivo Excel/CSV

    Returns:
        Diccionario con datos procesados y resumen
    """
    processor = ExcelProcessor()
    df = processor.cargar_excel(filepath)

    return {
        "datos": df.to_dict(orient='records'),
        "nomenclaturas": processor.get_nomenclaturas(),
        "resumen": processor.resumen()
    }


if __name__ == "__main__":
    # Test con archivo de ejemplo
    import sys

    if len(sys.argv) > 1:
        filepath = sys.argv[1]
        resultado = procesar_archivo(filepath)
        print(f"Total procesos: {resultado['resumen']['total_procesos']}")
        print(f"Nomenclaturas: {len(resultado['nomenclaturas'])}")
    else:
        print("Uso: python excel_processor.py <archivo.xlsx>")
