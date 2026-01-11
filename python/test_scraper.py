"""
Test rapido del scraper SEACE
Prueba con un proceso de ejemplo
"""
import json
from seace_scraper import scrape_proceso

def test():
    print("=" * 50)
    print("TEST: Scraper SEACE")
    print("=" * 50)

    # Proceso de prueba (ELSE)
    nomenclatura = "AS-SM-35-2024-ELSE-1"

    print(f"\nBuscando: {nomenclatura}")
    print("Esto puede tardar unos segundos...\n")

    resultado = scrape_proceso(nomenclatura, use_cache=True)

    if resultado.get('success'):
        print("\n[EXITO] Proceso encontrado!")
        print(f"\nCronograma ({len(resultado.get('cronograma', []))} etapas):")
        for etapa in resultado.get('cronograma', []):
            print(f"  - {etapa['etapa']}: {etapa['fecha_inicio']} - {etapa['fecha_fin']}")

        print(f"\nDocumentos ({len(resultado.get('documentos', []))} archivos):")
        for doc in resultado.get('documentos', [])[:5]:
            print(f"  - {doc['documento']}")

        print(f"\nInfo Entidad:")
        for k, v in list(resultado.get('info_entidad', {}).items())[:5]:
            print(f"  - {k}: {v}")

        # Guardar resultado completo
        with open('test_resultado.json', 'w', encoding='utf-8') as f:
            json.dump(resultado, f, ensure_ascii=False, indent=2)
        print("\n[OK] Resultado guardado en test_resultado.json")

    else:
        print(f"\n[ERROR] {resultado.get('error')}")

    return resultado

if __name__ == "__main__":
    test()
