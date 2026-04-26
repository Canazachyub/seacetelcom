"""
combinar_excels.py
==================

GUI para unir todos los listados de procesos que bajás con el scraper
(`SCRAPING-TELCOM/descargas/<EMPRESA>/`) en un solo archivo Excel listo
para pegar en la hoja SEACE_IMPORT de Google Sheets.

Por cada empresa busca, en este orden:
    1. Lista-Procesos.xlsx   (si lo exportó manualmente del SEACE)
    2. Procesos_Completo.csv (lo que genera el scraper Python)

Dedup automático por (Nomenclatura, Fecha Publicación) — mismo criterio que
usa Apps Script en `Import._buildExistingKeys`.

USO
---
    python combinar_excels.py

    (o doble-click si tenés Python asociado a .py)

DEPS
----
    pip install pandas openpyxl
    (tkinter viene con Python, no hace falta instalarlo)
"""

from __future__ import annotations

import os
import sys
import threading
from pathlib import Path
from tkinter import Tk, filedialog, messagebox, ttk, StringVar, Text, END, DISABLED, NORMAL

import pandas as pd

DEFAULT_DIR = Path(r"c:\PROGRAMACION\SCRAPING-TELCOM\descargas")
# Target files por empresa, en orden de preferencia (primero que exista gana)
TARGET_CANDIDATES = ["Lista-Procesos.xlsx", "Procesos_Completo.csv"]
OUTPUT_FILENAME = "COMBINADO_Lista-Procesos.xlsx"
# Apps Script IMPORT_COLS solo usa 10 columnas. El CSV trae 13 (las 3 últimas
# son Fecha Limite/Estado/Dias Restantes calculadas). Cortamos a las primeras 10
# para mantener el schema exacto que espera SEACE_IMPORT.
MAX_COLUMNAS_IMPORT = 10


# ============================================================
# Lógica (sin GUI) — la misma de antes, emite progreso via callback
# ============================================================

def _find_col(columns, *needles):
    for c in columns:
        low = str(c).lower()
        if all(n.lower() in low for n in needles):
            return c
    return None


def _leer_archivo(path: Path) -> pd.DataFrame:
    """Lee XLSX o CSV según la extensión. CSV prueba utf-8-sig y cp1252."""
    if path.suffix.lower() == ".xlsx":
        return pd.read_excel(path, engine="openpyxl")
    # CSV: intentar encodings comunes (Windows exporta con BOM o cp1252)
    for enc in ("utf-8-sig", "utf-8", "cp1252", "latin-1"):
        try:
            return pd.read_csv(path, encoding=enc)
        except UnicodeDecodeError:
            continue
    raise ValueError(f"No pude decodificar el CSV: {path}")


def _buscar_archivo_empresa(empresa_dir: Path) -> Path | None:
    """Busca el archivo de listado en una carpeta de empresa, en orden de
    preferencia (XLSX manual primero, CSV del scraper segundo)."""
    for nombre in TARGET_CANDIDATES:
        candidato = empresa_dir / nombre
        if candidato.exists() and candidato.is_file():
            return candidato
    return None


def combinar(base_dir: Path, log):
    """Ejecuta la combinación. `log(texto)` se llama con mensajes de progreso.
    Retorna la ruta al archivo generado, o None si falló."""
    if not base_dir.exists():
        log(f"❌ No existe la carpeta: {base_dir}")
        return None

    # Iterar solo subcarpetas de primer nivel (una por empresa). Evita meterse
    # en carpetas por-proceso (Proceso_XXX_N/) que tienen otros CSVs (Cronograma).
    empresas = sorted([p for p in base_dir.iterdir() if p.is_dir()])
    if not empresas:
        log(f"❌ No encontré subcarpetas en {base_dir}")
        return None

    archivos: list[Path] = []
    sin_listado: list[str] = []
    for emp in empresas:
        encontrado = _buscar_archivo_empresa(emp)
        if encontrado and encontrado.name != OUTPUT_FILENAME:
            archivos.append(encontrado)
        else:
            sin_listado.append(emp.name)

    if not archivos:
        candidatos = " o ".join(f"'{n}'" for n in TARGET_CANDIDATES)
        log(f"❌ No encontré {candidatos} en ninguna subcarpeta de {base_dir}")
        return None

    log(f"📂 {len(archivos)} archivos detectados (de {len(empresas)} empresas):")
    for a in archivos:
        log(f"   • {a.parent.name}/{a.name}")
    if sin_listado:
        log("")
        log(f"⚠ Empresas sin listado ({len(sin_listado)}): {', '.join(sin_listado)}")
    log("")

    dfs = []
    total_filas_leidas = 0
    for archivo in archivos:
        try:
            df = _leer_archivo(archivo)
            df["_EMPRESA_ORIGEN"] = archivo.parent.name
            dfs.append(df)
            total_filas_leidas += len(df)
            log(f"   ✓ {archivo.parent.name:20s} → {len(df):4d} filas  [{archivo.suffix.lstrip('.').upper()}]")
        except Exception as e:
            log(f"   ✗ {archivo.parent.name}: {e}")

    if not dfs:
        log("❌ Ningún archivo pudo leerse.")
        return None

    combined = pd.concat(dfs, ignore_index=True)

    col_nom = _find_col(combined.columns, "nomenclatur")
    col_fecha = _find_col(combined.columns, "fecha", "public")

    antes = len(combined)
    if col_nom and col_fecha:
        combined = combined.drop_duplicates(subset=[col_nom, col_fecha], keep="first")
        dedup_criterio = f"({col_nom}, {col_fecha})"
    elif col_nom:
        combined = combined.drop_duplicates(subset=[col_nom], keep="first")
        dedup_criterio = f"({col_nom})"
    else:
        dedup_criterio = "sin dedup (no encontré columna Nomenclatura)"

    duplicados = antes - len(combined)

    if "_EMPRESA_ORIGEN" in combined.columns:
        combined = combined.drop(columns=["_EMPRESA_ORIGEN"])

    # Recortar al schema que espera SEACE_IMPORT (primeras 10 cols). El CSV
    # del scraper trae 3 columnas extras (Fecha Limite / Estado / Dias
    # Restantes) que Apps Script no usa y solo ensucian el paste.
    if len(combined.columns) > MAX_COLUMNAS_IMPORT:
        descartadas = list(combined.columns[MAX_COLUMNAS_IMPORT:])
        combined = combined.iloc[:, :MAX_COLUMNAS_IMPORT]
        log(f"   ⓘ Columnas extras descartadas: {', '.join(str(c) for c in descartadas)}")

    # Reenumerar N° si la primera columna es esa
    if len(combined.columns):
        col_numero = combined.columns[0]
        label = str(col_numero).strip().upper().replace("°", "")
        if label in ("N", "NO", "NRO", "NUMERO", "NÚMERO"):
            combined[col_numero] = range(1, len(combined) + 1)

    output = base_dir / OUTPUT_FILENAME
    try:
        combined.to_excel(output, index=False, engine="openpyxl")
    except ModuleNotFoundError as e:
        if "openpyxl" in str(e):
            log("")
            log("⚠ openpyxl no está instalado. Guardando como CSV (abrí con Excel, copiá, pegá en Sheets).")
            log("  Para output XLSX nativo: pip install openpyxl")
            output = base_dir / OUTPUT_FILENAME.replace(".xlsx", ".csv")
            combined.to_csv(output, index=False, encoding="utf-8-sig")
        else:
            raise

    log("")
    log(f"✅ Generado: {output}")
    log(f"   Filas totales leídas: {total_filas_leidas}")
    log(f"   Dedup {dedup_criterio}: -{duplicados}")
    log(f"   Filas finales:        {len(combined)}")
    return output


# ============================================================
# GUI
# ============================================================

class App:
    def __init__(self, root: Tk):
        self.root = root
        root.title("SEACE · Combinar Lista-Procesos")
        root.geometry("760x520")
        root.minsize(600, 400)

        style = ttk.Style()
        try:
            style.theme_use("vista")  # Windows default, más nativo
        except Exception:
            pass

        # Frame superior: selector de carpeta
        top = ttk.Frame(root, padding=12)
        top.pack(fill="x")

        ttk.Label(top, text="Carpeta raíz de descargas (con subcarpetas por empresa):").pack(anchor="w")

        row = ttk.Frame(top)
        row.pack(fill="x", pady=(4, 0))

        self.folder_var = StringVar(value=str(DEFAULT_DIR) if DEFAULT_DIR.exists() else "")
        self.entry = ttk.Entry(row, textvariable=self.folder_var)
        self.entry.pack(side="left", fill="x", expand=True)

        ttk.Button(row, text="Elegir…", command=self.pick_folder).pack(side="left", padx=(6, 0))

        # Frame de botones
        btn_row = ttk.Frame(root, padding=(12, 0, 12, 8))
        btn_row.pack(fill="x")

        self.btn_run = ttk.Button(btn_row, text="▶ Combinar", command=self.run_combinar)
        self.btn_run.pack(side="left")

        self.btn_open = ttk.Button(btn_row, text="📂 Abrir archivo generado", command=self.open_output, state=DISABLED)
        self.btn_open.pack(side="left", padx=(6, 0))

        self.btn_reveal = ttk.Button(btn_row, text="📁 Abrir carpeta", command=self.reveal_output, state=DISABLED)
        self.btn_reveal.pack(side="left", padx=(6, 0))

        # Log
        log_frame = ttk.LabelFrame(root, text="Log", padding=6)
        log_frame.pack(fill="both", expand=True, padx=12, pady=(0, 6))

        self.log_text = Text(log_frame, height=18, wrap="word", font=("Consolas", 9))
        self.log_text.pack(side="left", fill="both", expand=True)

        scrollbar = ttk.Scrollbar(log_frame, orient="vertical", command=self.log_text.yview)
        scrollbar.pack(side="right", fill="y")
        self.log_text.config(yscrollcommand=scrollbar.set, state=DISABLED)

        # Barra de estado
        self.status_var = StringVar(value="Listo. Seleccioná la carpeta y presioná Combinar.")
        status = ttk.Label(root, textvariable=self.status_var, relief="sunken", anchor="w", padding=(8, 4))
        status.pack(fill="x", side="bottom")

        self.output_path: Path | None = None

    # --- helpers ---

    def log(self, msg: str):
        self.log_text.config(state=NORMAL)
        self.log_text.insert(END, msg + "\n")
        self.log_text.see(END)
        self.log_text.config(state=DISABLED)
        self.root.update_idletasks()

    def clear_log(self):
        self.log_text.config(state=NORMAL)
        self.log_text.delete("1.0", END)
        self.log_text.config(state=DISABLED)

    def pick_folder(self):
        initial = self.folder_var.get() or str(DEFAULT_DIR)
        if not Path(initial).exists():
            initial = str(Path.home())
        folder = filedialog.askdirectory(
            title="Seleccioná la carpeta 'descargas' con subcarpetas por empresa",
            initialdir=initial,
        )
        if folder:
            self.folder_var.set(folder)

    def run_combinar(self):
        folder = self.folder_var.get().strip()
        if not folder:
            messagebox.showwarning("Falta carpeta", "Primero seleccioná la carpeta raíz.")
            return
        base = Path(folder)
        if not base.exists():
            messagebox.showerror("Carpeta inválida", f"No existe:\n{base}")
            return

        self.clear_log()
        self.output_path = None
        self.btn_run.config(state=DISABLED)
        self.btn_open.config(state=DISABLED)
        self.btn_reveal.config(state=DISABLED)
        self.status_var.set("Procesando…")

        # Ejecutar en hilo aparte para no congelar la GUI
        def worker():
            try:
                result = combinar(base, self.log)
                self.output_path = result
                if result:
                    self.status_var.set(f"✅ Listo · {result.name}")
                    self.btn_open.config(state=NORMAL)
                    self.btn_reveal.config(state=NORMAL)
                    messagebox.showinfo(
                        "Combinado generado",
                        f"Archivo:\n{result}\n\n"
                        "Siguiente paso:\n"
                        "1. Abrilo en Excel\n"
                        "2. Seleccioná desde A2 → última fila → Ctrl+C\n"
                        "3. Google Sheets → SEACE_IMPORT → A2 → Ctrl+V\n"
                        "4. Menú 🔷 SEACE Intelligence → Procesar Import SEACE"
                    )
                else:
                    self.status_var.set("❌ Falló (ver log)")
            except Exception as e:
                self.log(f"❌ Error: {e}")
                self.status_var.set("❌ Falló (ver log)")
            finally:
                self.btn_run.config(state=NORMAL)

        threading.Thread(target=worker, daemon=True).start()

    def open_output(self):
        if self.output_path and self.output_path.exists():
            try:
                os.startfile(str(self.output_path))  # Windows
            except AttributeError:
                import subprocess
                subprocess.Popen(["xdg-open" if sys.platform.startswith("linux") else "open", str(self.output_path)])

    def reveal_output(self):
        if self.output_path and self.output_path.exists():
            try:
                os.startfile(str(self.output_path.parent))
            except AttributeError:
                import subprocess
                subprocess.Popen(["xdg-open" if sys.platform.startswith("linux") else "open", str(self.output_path.parent)])


def main():
    root = Tk()
    App(root)
    root.mainloop()


if __name__ == "__main__":
    main()
