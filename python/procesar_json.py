"""
Procesa el JSON descargado del Portal OCDS
Uso: python procesar_json.py "ruta/al/archivo.json"
"""
import sys
import json
from pathlib import Path
from datetime import datetime

# Agregar carpeta padre al path para imports
sys.path.insert(0, str(Path(__file__).parent))

from config import OUTPUT_DIR


def procesar_ocds_json(filepath: str) -> dict:
    """
    Procesa un JSON descargado del Portal de Contrataciones Abiertas

    Returns:
        Diccionario con datos estructurados
    """
    with open(filepath, 'r', encoding='utf-8') as f:
        data = json.load(f)

    records = data.get("records", [])
    if not records:
        raise ValueError("JSON no contiene records")

    record = records[0]
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
        postores.append({
            "ruc": t.get("id", "").replace("PE-RUC-", ""),
            "nombre": t.get("name")
        })

    # Ganador
    ganador = None
    monto_adjudicado = None
    if awards:
        suppliers = awards[0].get("suppliers", [])
        if suppliers:
            ganador = {
                "ruc": suppliers[0].get("id", "").replace("PE-RUC-", ""),
                "nombre": suppliers[0].get("name")
            }
        monto_adjudicado = awards[0].get("value", {}).get("amount")

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
        "nomenclatura": tender.get("title"),
        "descripcion": tender.get("description"),
        "tipo": tender.get("procurementMethodDetails"),
        "categoria": tender.get("mainProcurementCategory"),
        "valor_referencial": tender.get("value", {}).get("amount"),
        "moneda": tender.get("value", {}).get("currency"),
        "fecha_publicacion": tender.get("datePublished"),
        "entidad": entidad,
        "cronograma": {
            "convocatoria": tender.get("tenderPeriod", {}).get("startDate"),
            "consultas_inicio": tender.get("enquiryPeriod", {}).get("startDate"),
            "consultas_fin": tender.get("enquiryPeriod", {}).get("endDate"),
            "buena_pro": awards[0].get("date") if awards else None
        },
        "postores": postores,
        "num_postores": len(postores),
        "ganador": ganador,
        "monto_adjudicado": monto_adjudicado,
        "contrato": contrato,
        "documentos": documentos,
        "num_documentos": len(documentos)
    }


def main():
    # Buscar JSON en la carpeta del proyecto
    if len(sys.argv) > 1:
        json_path = sys.argv[1]
    else:
        # Buscar el JSON descargado por defecto
        default_path = Path(__file__).parent.parent / "json descargado.json"
        if default_path.exists():
            json_path = str(default_path)
        else:
            print("Uso: python procesar_json.py <archivo.json>")
            print("O coloca 'json descargado.json' en la carpeta SEACE")
            return

    print("=" * 60)
    print("PROCESADOR DE JSON OCDS")
    print("=" * 60)
    print(f"\nArchivo: {json_path}")

    # Procesar
    datos = procesar_ocds_json(json_path)

    # Mostrar resumen
    print(f"\n{'='*60}")
    print("RESUMEN DEL PROCESO")
    print("=" * 60)

    print(f"\n[GENERAL]")
    print(f"  OCID: {datos['ocid']}")
    print(f"  Nomenclatura: {datos['nomenclatura']}")
    print(f"  Descripcion: {datos['descripcion']}")
    print(f"  Tipo: {datos['tipo']}")
    print(f"  Categoria: {datos['categoria']}")
    print(f"  Fecha pub: {datos['fecha_publicacion']}")

    print(f"\n[VALORES]")
    print(f"  Valor referencial: {datos['valor_referencial']:,.2f} {datos['moneda']}")
    if datos['monto_adjudicado']:
        print(f"  Monto adjudicado: {datos['monto_adjudicado']:,.2f} {datos['moneda']}")

    print(f"\n[ENTIDAD]")
    for k, v in datos['entidad'].items():
        if v:
            print(f"  {k}: {v}")

    print(f"\n[CRONOGRAMA]")
    for k, v in datos['cronograma'].items():
        if v:
            print(f"  {k}: {v}")

    print(f"\n[POSTORES] ({datos['num_postores']})")
    for p in datos['postores'][:10]:
        print(f"  - {p['nombre']} (RUC: {p['ruc']})")

    if datos['ganador']:
        print(f"\n[GANADOR]")
        print(f"  {datos['ganador']['nombre']}")
        print(f"  RUC: {datos['ganador']['ruc']}")

    if datos['contrato']:
        print(f"\n[CONTRATO]")
        print(f"  Numero: {datos['contrato']['numero']}")
        print(f"  Monto: {datos['contrato']['monto']:,.2f}")
        print(f"  Duracion: {datos['contrato']['duracion_dias']} dias")

    print(f"\n[DOCUMENTOS] ({datos['num_documentos']})")
    for d in datos['documentos']:
        print(f"  - {d['titulo']} ({d['formato']})")

    # Guardar procesado
    output_file = OUTPUT_DIR / f"{datos['nomenclatura'].replace('/', '-')}_procesado.json"
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(datos, f, ensure_ascii=False, indent=2)

    print(f"\n{'='*60}")
    print(f"[OK] Guardado en: {output_file}")


if __name__ == "__main__":
    main()
