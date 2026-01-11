"""
Test rapido de la API OCDS
"""
import requests
import json

def test_api():
    print("=" * 60)
    print("TEST: API OCDS - Buscando AS-SM-35-2024-ELSE-1")
    print("=" * 60)

    url = "https://contratacionesabiertas.oece.gob.pe/api/v1/records"
    params = {
        "tenderTitle": "AS-SM-35-2024-ELSE-1",
        "page": 1,
        "paginateBy": 10
    }

    print(f"\nURL: {url}")
    print(f"Params: {params}")
    print("\nBuscando...")

    response = requests.get(url, params=params, timeout=30)

    if response.status_code == 200:
        data = response.json()
        records = data.get("records", [])

        if records:
            print(f"\n[EXITO] {len(records)} resultado(s) encontrado(s)")

            record = records[0]
            compiled = record.get("compiledRelease", {})
            tender = compiled.get("tender", {})
            awards = compiled.get("awards", [])
            contracts = compiled.get("contracts", [])

            print(f"\n--- DATOS DEL PROCESO ---")
            print(f"OCID: {compiled.get('ocid')}")
            print(f"Nomenclatura: {tender.get('title')}")
            print(f"Descripcion: {tender.get('description')}")
            print(f"Tipo: {tender.get('procurementMethodDetails')}")
            print(f"Valor Ref: {tender.get('value', {}).get('amount'):,.2f} PEN")

            print(f"\n--- POSTORES ({len(tender.get('tenderers', []))}) ---")
            for t in tender.get("tenderers", [])[:5]:
                print(f"  - {t.get('name')}")

            if awards:
                award = awards[0]
                suppliers = award.get("suppliers", [])
                print(f"\n--- ADJUDICACION ---")
                print(f"Ganador: {suppliers[0].get('name') if suppliers else 'N/A'}")
                print(f"Monto: {award.get('value', {}).get('amount'):,.2f} PEN")

            if contracts:
                c = contracts[0]
                print(f"\n--- CONTRATO ---")
                print(f"Numero: {c.get('title')}")
                print(f"Monto: {c.get('value', {}).get('amount'):,.2f} PEN")
                print(f"Duracion: {c.get('period', {}).get('durationInDays')} dias")

            print(f"\n--- DOCUMENTOS ({len(tender.get('documents', []))}) ---")
            for d in tender.get("documents", []):
                print(f"  - {d.get('title')} ({d.get('format')})")

            # Guardar JSON completo
            with open("test_api_resultado.json", "w", encoding="utf-8") as f:
                json.dump(record, f, ensure_ascii=False, indent=2)
            print(f"\n[OK] JSON completo guardado en test_api_resultado.json")

        else:
            print("[NO ENCONTRADO]")
    else:
        print(f"[ERROR] Status: {response.status_code}")
        print(response.text)

if __name__ == "__main__":
    test_api()
