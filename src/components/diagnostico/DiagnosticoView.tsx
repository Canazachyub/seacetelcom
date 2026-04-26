import { useEffect, useState } from 'react';
import { CheckCircle2, XCircle, RefreshCw, Activity, Search, Copy, Check } from 'lucide-react';
import { clsx } from 'clsx';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { toast } from '../ui/Toast';
import {
  healthCheck,
  debugBuscarIndice,
  getProcesoOCDS,
  getByTenderId,
  getByOcid,
  type HealthCheckItem,
} from '../../services/api';
import { OcdsIndexManager } from './OcdsIndexManager';

type TestResult = {
  id: string;
  nombre: string;
  grupo: string;
  estado: 'pendiente' | 'corriendo' | 'ok' | 'error';
  detalle?: string;
  latencia?: number;
  raw?: unknown;
};

const TESTS_RAPIDOS: Array<{ id: string; nombre: string; grupo: string; run: () => Promise<{ ok: boolean; detalle: string; raw?: unknown }> }> = [
  {
    id: 'ocds-known',
    nombre: 'OCDS · Buscar proceso 2024 conocido',
    grupo: 'Consultas',
    run: async () => {
      const r = await getProcesoOCDS('SIE-SIE-98-2024-OEC/GR-PUNO-1');
      return {
        ok: !!r,
        detalle: r ? `Encontrado · Tender ${r.tenderId}` : 'No encontrado',
        raw: r,
      };
    },
  },
  {
    id: 'ocds-2026',
    nombre: 'OCDS · Live-fetch proceso 2026',
    grupo: 'Consultas',
    run: async () => {
      const r = await getProcesoOCDS('CP-ABR-20-2026-ELSE-1');
      return {
        ok: !!r,
        detalle: r ? `Encontrado vía live-fetch · ${r.entidad?.nombre || ''}` : 'No disponible en API OCDS aún',
        raw: r,
      };
    },
  },
  {
    id: 'ocds-tender',
    nombre: 'OCDS · Consulta directa por Tender ID',
    grupo: 'Consultas',
    run: async () => {
      const r = await getByTenderId('1089084');
      return {
        ok: !!r,
        detalle: r ? `OK · ${r.nomenclatura || 'sin nomenclatura'}` : 'No encontrado',
        raw: r,
      };
    },
  },
  {
    id: 'ocds-ocid',
    nombre: 'OCDS · Consulta directa por OCID',
    grupo: 'Consultas',
    run: async () => {
      const r = await getByOcid('ocds-dgy273-seacev3-1089084');
      return {
        ok: !!r,
        detalle: r ? 'OK' : 'No encontrado',
        raw: r,
      };
    },
  },
];

function ChipEstado({ estado }: { estado: TestResult['estado'] }) {
  const map = {
    pendiente: { bg: 'bg-gray-100 text-gray-500', label: '—' },
    corriendo: { bg: 'bg-blue-50 text-blue-700', label: '…' },
    ok: { bg: 'bg-emerald-50 text-emerald-700', label: 'OK' },
    error: { bg: 'bg-red-50 text-red-700', label: 'FAIL' },
  }[estado];
  return (
    <span className={clsx('px-2 py-0.5 rounded-full text-xs font-mono font-semibold', map.bg)}>
      {map.label}
    </span>
  );
}

function HealthRow({ item }: { item: HealthCheckItem }) {
  return (
    <div className="flex items-start justify-between py-2 px-3 border-b border-gray-100 last:border-0">
      <div className="flex items-start gap-3 flex-1 min-w-0">
        {item.ok ? (
          <CheckCircle2 size={18} className="text-emerald-600 mt-0.5 flex-shrink-0" />
        ) : (
          <XCircle size={18} className="text-red-600 mt-0.5 flex-shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">{item.nombre}</p>
          <p className={clsx('text-xs truncate', item.ok ? 'text-gray-500' : 'text-red-600')}>
            {item.detalle}
          </p>
        </div>
      </div>
    </div>
  );
}

export function DiagnosticoView() {
  const [loadingHealth, setLoadingHealth] = useState(false);
  const [healthItems, setHealthItems] = useState<HealthCheckItem[]>([]);
  const [healthMeta, setHealthMeta] = useState<{ total: number; pasadas: number; duracion: string } | null>(null);
  const [tests, setTests] = useState<TestResult[]>(
    TESTS_RAPIDOS.map((t) => ({ id: t.id, nombre: t.nombre, grupo: t.grupo, estado: 'pendiente' }))
  );
  const [debugNomenclatura, setDebugNomenclatura] = useState('SIE-SIE-98-2024-OEC/GR-PUNO-1');
  const [debugResult, setDebugResult] = useState<Record<string, unknown> | null>(null);
  const [debugLoading, setDebugLoading] = useState(false);
  const [copiado, setCopiado] = useState(false);

  async function runHealth() {
    setLoadingHealth(true);
    try {
      const r = await healthCheck();
      setHealthItems(r.checks || []);
      setHealthMeta({ total: r.totalChecks, pasadas: r.pasadas, duracion: r.duracion });
      if (!r.success && r.error) toast.error(`Health check falló: ${r.error}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error ejecutando health check');
    } finally {
      setLoadingHealth(false);
    }
  }

  async function runAllTests() {
    for (const test of TESTS_RAPIDOS) {
      setTests((prev) => prev.map((t) => (t.id === test.id ? { ...t, estado: 'corriendo' } : t)));
      const start = Date.now();
      try {
        const r = await test.run();
        const latencia = Date.now() - start;
        setTests((prev) =>
          prev.map((t) =>
            t.id === test.id
              ? { ...t, estado: r.ok ? 'ok' : 'error', detalle: r.detalle, latencia, raw: r.raw }
              : t
          )
        );
      } catch (e) {
        const latencia = Date.now() - start;
        setTests((prev) =>
          prev.map((t) =>
            t.id === test.id
              ? {
                  ...t,
                  estado: 'error',
                  detalle: e instanceof Error ? e.message : String(e),
                  latencia,
                }
              : t
          )
        );
      }
    }
  }

  async function runDebug() {
    if (!debugNomenclatura.trim()) {
      toast.warning('Ingresa una nomenclatura');
      return;
    }
    setDebugLoading(true);
    setDebugResult(null);
    try {
      const r = await debugBuscarIndice(debugNomenclatura.trim());
      setDebugResult(r);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error en debug');
    } finally {
      setDebugLoading(false);
    }
  }

  useEffect(() => {
    runHealth();
  }, []);

  const healthByGroup = healthItems.reduce<Record<string, HealthCheckItem[]>>((acc, item) => {
    (acc[item.grupo] = acc[item.grupo] || []).push(item);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Activity size={24} className="text-blue-600" />
            Diagnóstico del sistema
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Verifica la conexión y salud de cada hoja, integración y endpoint del backend.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            icon={<RefreshCw size={14} className={loadingHealth ? 'animate-spin' : ''} />}
            onClick={runHealth}
            disabled={loadingHealth}
          >
            {loadingHealth ? 'Ejecutando…' : 'Ejecutar health check'}
          </Button>
          <Button variant="primary" size="sm" icon={<Activity size={14} />} onClick={runAllTests}>
            Correr todos los tests
          </Button>
        </div>
      </div>

      {/* Resumen */}
      {healthMeta && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <div className="text-center">
              <p className="text-3xl font-bold text-emerald-600">
                {healthMeta.pasadas}/{healthMeta.total}
              </p>
              <p className="text-sm text-gray-500">Checks pasados</p>
            </div>
          </Card>
          <Card>
            <div className="text-center">
              <p className="text-3xl font-bold text-gray-900">{healthMeta.duracion}</p>
              <p className="text-sm text-gray-500">Duración total</p>
            </div>
          </Card>
          <Card>
            <div className="text-center">
              <p className="text-3xl font-bold text-red-600">{healthMeta.total - healthMeta.pasadas}</p>
              <p className="text-sm text-gray-500">Fallos detectados</p>
            </div>
          </Card>
        </div>
      )}

      {/* Health check agrupado */}
      {Object.keys(healthByGroup).length > 0 && (
        <Card>
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Estado por grupo</h2>
          <div className="space-y-4">
            {Object.entries(healthByGroup).map(([grupo, items]) => (
              <div key={grupo}>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{grupo}</p>
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  {items.map((item, i) => (
                    <HealthRow key={`${grupo}-${i}`} item={item} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Gestor del índice OCDS */}
      <OcdsIndexManager />

      {/* Tests de consulta */}
      <Card>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Tests de consulta OCDS</h2>
        <div className="border border-gray-200 rounded-lg overflow-hidden divide-y divide-gray-100">
          {tests.map((t) => (
            <div key={t.id} className="px-3 py-2.5 flex items-center justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <ChipEstado estado={t.estado} />
                  <p className="text-sm font-medium text-gray-900 truncate">{t.nombre}</p>
                </div>
                {t.detalle && (
                  <p
                    className={clsx(
                      'text-xs mt-0.5 ml-14 truncate',
                      t.estado === 'error' ? 'text-red-600' : 'text-gray-500'
                    )}
                  >
                    {t.detalle}
                  </p>
                )}
              </div>
              {t.latencia != null && (
                <span className="text-xs font-mono text-gray-400 flex-shrink-0">{t.latencia}ms</span>
              )}
            </div>
          ))}
        </div>
      </Card>

      {/* Debug OCDS_INDEX */}
      <Card>
        <h2 className="text-lg font-semibold text-gray-900 mb-1 flex items-center gap-2">
          <Search size={18} />
          Debug búsqueda en OCDS_INDEX
        </h2>
        <p className="text-sm text-gray-500 mb-3">
          Muestra qué ve cada estrategia de búsqueda (TextFinder exact, substring, scan lineal) para una
          nomenclatura concreta. Útil para diagnosticar falsos "no encontrado".
        </p>
        <div className="flex gap-2 mb-3">
          <input
            type="text"
            value={debugNomenclatura}
            onChange={(e) => setDebugNomenclatura(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && runDebug()}
            placeholder="SIE-SIE-98-2024-OEC/GR-PUNO-1"
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <Button variant="primary" size="sm" onClick={runDebug} disabled={debugLoading}>
            {debugLoading ? 'Buscando…' : 'Debuguear'}
          </Button>
        </div>

        {debugResult && (
          <div className="space-y-3">
            <div className="flex justify-end">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(JSON.stringify(debugResult, null, 2));
                  setCopiado(true);
                  setTimeout(() => setCopiado(false), 2000);
                }}
                className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"
              >
                {copiado ? <Check size={12} /> : <Copy size={12} />}
                {copiado ? 'Copiado' : 'Copiar JSON'}
              </button>
            </div>
            <pre className="bg-gray-900 text-gray-100 text-xs p-3 rounded-lg overflow-x-auto max-h-96 overflow-y-auto">
              {JSON.stringify(debugResult, null, 2)}
            </pre>
          </div>
        )}
      </Card>
    </div>
  );
}
