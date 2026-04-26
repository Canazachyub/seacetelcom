import { useEffect, useState, useCallback } from 'react';
import { clsx } from 'clsx';
import { RefreshCw, Download, Loader2, Calendar } from 'lucide-react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { toast } from '../ui/Toast';
import {
  getOcdsIndexStats,
  actualizarIndiceOCDS,
  type AñoIndexInfo,
  type EstadoMesIndex,
} from '../../services/api';

const MESES_ABREV = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

function formatRelativeDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays < 1) return 'hoy';
  if (diffDays === 1) return 'ayer';
  if (diffDays < 30) return `hace ${diffDays}d`;
  if (diffDays < 365) return `hace ${Math.floor(diffDays / 30)}m`;
  return `hace ${Math.floor(diffDays / 365)}a`;
}

function getStatusStyles(status: EstadoMesIndex): { bg: string; text: string; border: string; label: string } {
  const map: Record<EstadoMesIndex, { bg: string; text: string; border: string; label: string }> = {
    indexed: { bg: 'bg-emerald-50 hover:bg-emerald-100', text: 'text-emerald-700', border: 'border-emerald-200', label: 'Indexado' },
    missing: { bg: 'bg-red-50 hover:bg-red-100', text: 'text-red-700', border: 'border-red-200', label: 'Falta scrapear' },
    extra: { bg: 'bg-amber-50 hover:bg-amber-100', text: 'text-amber-700', border: 'border-amber-200', label: 'En índice, no en API' },
    unavailable: { bg: 'bg-gray-50', text: 'text-gray-400', border: 'border-gray-200', label: 'Sin datos en API' },
  };
  return map[status];
}

interface MesCellProps {
  año: number;
  mes: number;
  count: number;
  status: EstadoMesIndex;
  lastUpdate: string | null;
  onScrape: (año: number, mes: number) => void;
  isScraping: boolean;
}

function MesCell({ año, mes, count, status, lastUpdate, onScrape, isScraping }: MesCellProps) {
  const styles = getStatusStyles(status);
  const isDisabled = status === 'unavailable' || isScraping;
  const actionable = status === 'missing' || status === 'indexed' || status === 'extra';

  return (
    <button
      onClick={() => actionable && onScrape(año, mes)}
      disabled={isDisabled}
      title={`${styles.label}${count > 0 ? ` · ${count.toLocaleString('es-PE')} procesos` : ''}${lastUpdate ? ` · actualizado ${formatRelativeDate(lastUpdate)}` : ''}${actionable ? ' · click para actualizar' : ''}`}
      className={clsx(
        'relative flex flex-col items-center justify-center gap-0.5 p-2 rounded border transition-all',
        'min-h-[56px] text-xs',
        styles.bg,
        styles.text,
        styles.border,
        isDisabled && 'cursor-not-allowed opacity-60',
        !isDisabled && actionable && 'cursor-pointer hover:shadow-sm',
      )}
    >
      {isScraping ? (
        <Loader2 size={14} className="animate-spin" />
      ) : (
        <>
          <span className="font-semibold">
            {status === 'unavailable' ? '—' : count.toLocaleString('es-PE')}
          </span>
          {lastUpdate && <span className="text-[10px] opacity-75">{formatRelativeDate(lastUpdate)}</span>}
        </>
      )}
    </button>
  );
}

export function OcdsIndexManager() {
  const [años, setAños] = useState<Record<string, AñoIndexInfo> | null>(null);
  const [loading, setLoading] = useState(false);
  const [backendDesactualizado, setBackendDesactualizado] = useState(false);
  const [scrapingCells, setScrapingCells] = useState<Set<string>>(new Set());

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const r = await getOcdsIndexStats();
      if (r.success) {
        setAños(r.años);
        setBackendDesactualizado(false);
      } else if (r.error && /acci[oó]n no v[aá]lida/i.test(r.error)) {
        setBackendDesactualizado(true);
      } else {
        toast.error(`No se pudo cargar el estado del índice${r.error ? ': ' + r.error : ''}`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/acci[oó]n no v[aá]lida/i.test(msg)) {
        setBackendDesactualizado(true);
      } else {
        toast.error('Error al cargar estado: ' + msg);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function scrapeMes(año: number, mes: number) {
    const key = `${año}-${mes}`;
    setScrapingCells((prev) => new Set(prev).add(key));
    const monthLabel = `${MESES_ABREV[mes - 1]} ${año}`;
    toast.info(`Actualizando ${monthLabel}... (1-3 min, no cierres la pestaña)`);

    try {
      const r = await actualizarIndiceOCDS(año, undefined, mes);
      if (r.success) {
        toast.success(`${monthLabel} actualizado · ${r.total || 0} procesos`);
        await cargar();
      } else {
        toast.error(`Error actualizando ${monthLabel}: ${r.error || 'desconocido'}`);
      }
    } catch (e) {
      toast.error(`Error actualizando ${monthLabel}: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setScrapingCells((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  }

  async function scrapeAño(año: number) {
    setScrapingCells((prev) => new Set(prev).add(`${año}-all`));
    toast.info(`Actualizando ${año} completo... (15-30 min, no cierres la pestaña)`);

    try {
      const r = await actualizarIndiceOCDS(año);
      if (r.success) {
        toast.success(`${año} actualizado · ${r.total || 0} procesos`);
        await cargar();
      } else {
        toast.error(`Error actualizando ${año}: ${r.error || 'desconocido'}`);
      }
    } catch (e) {
      toast.error(`Error actualizando ${año}: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setScrapingCells((prev) => {
        const next = new Set(prev);
        next.delete(`${año}-all`);
        return next;
      });
    }
  }

  const añosOrdenados = años ? Object.keys(años).map(Number).sort((a, b) => b - a) : [];

  return (
    <Card>
      <div className="p-5 border-b border-gray-100 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Calendar size={18} className="text-emerald-600" />
            Cobertura del índice OCDS
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Qué meses de la API OCDS están cargados en tu hoja <code className="text-xs bg-gray-100 px-1 rounded">OCDS_INDEX</code>.
            Click en una celda para actualizar ese mes.
          </p>
        </div>
        <Button variant="outline" size="sm" icon={<RefreshCw size={14} className={loading ? 'animate-spin' : ''} />} onClick={cargar} loading={loading}>
          Recargar
        </Button>
      </div>

      {/* Leyenda */}
      <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 flex gap-4 flex-wrap text-xs">
        <LegendItem color="bg-emerald-100 border-emerald-300" label="Indexado" />
        <LegendItem color="bg-red-100 border-red-300" label="Falta scrapear" />
        <LegendItem color="bg-amber-100 border-amber-300" label="Sin mes asignado (datos viejos)" />
        <LegendItem color="bg-gray-100 border-gray-300" label="Sin datos en API" />
      </div>

      {/* Banner: backend desactualizado */}
      {backendDesactualizado && (
        <div className="mx-5 mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-900">
          <p className="font-semibold mb-1">⚠️ Apps Script desactualizado</p>
          <p className="mb-2">
            El backend de Google Apps Script aún no expone <code className="text-xs bg-amber-100 px-1 rounded">getOcdsIndexStats</code>.
            Para activar este panel:
          </p>
          <ol className="list-decimal list-inside space-y-0.5 text-xs">
            <li>Abrí el editor de Apps Script donde está publicada la API.</li>
            <li>Pegá el contenido actualizado de <code className="bg-amber-100 px-1 rounded">GOOGLE_APPS_SCRIPT.js</code> del repo.</li>
            <li>Implementar → Administrar implementaciones → Editar la activa → Nueva versión → Implementar.</li>
            <li>Mantené el mismo deployment ID para que la URL siga funcionando.</li>
          </ol>
        </div>
      )}

      {/* Matriz */}
      <div className="p-5 overflow-x-auto">
        {!años && loading && (
          <div className="flex items-center justify-center py-12 text-gray-400">
            <Loader2 size={24} className="animate-spin" />
          </div>
        )}

        {años && añosOrdenados.length === 0 && (
          <p className="text-center text-gray-400 py-8">No hay datos en el índice. Agregá un año para empezar.</p>
        )}

        {años && añosOrdenados.length > 0 && (
          <table className="w-full">
            <thead>
              <tr>
                <th className="text-left text-xs font-semibold text-gray-600 pb-2 pr-3 w-20">Año</th>
                <th className="text-right text-xs font-semibold text-gray-600 pb-2 pr-3 w-28">Total</th>
                <th className="text-center text-xs font-semibold text-gray-600 pb-2 px-1 w-20" title="Datos viejos que no tienen columna MES poblada. Re-scrapear el año los migra.">Sin mes</th>
                {MESES_ABREV.map((m) => (
                  <th key={m} className="text-center text-xs font-semibold text-gray-600 pb-2 px-0.5">{m}</th>
                ))}
                <th className="text-center text-xs font-semibold text-gray-600 pb-2 pl-3 w-28">Todo el año</th>
              </tr>
            </thead>
            <tbody>
              {añosOrdenados.map((año) => {
                const info = años[String(año)];
                const fullYearScraping = scrapingCells.has(`${año}-all`);
                return (
                  <tr key={año} className="border-t border-gray-100">
                    <td className="py-1.5 pr-3 font-semibold text-gray-900">{año}</td>
                    <td className="py-1.5 pr-3 text-right text-sm font-mono text-gray-700">
                      {info.total.toLocaleString('es-PE')}
                    </td>
                    <td className="py-1.5 px-1 text-center text-xs font-mono" title={info.sinMes > 0 ? `${info.sinMes.toLocaleString('es-PE')} procesos sin mes asignado. Re-scrapear el año los migra.` : 'Sin pendientes de migrar'}>
                      {info.sinMes > 0 ? (
                        <span className="inline-block px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
                          {info.sinMes.toLocaleString('es-PE')}
                        </span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((mes) => {
                      const mesInfo = info.meses[String(mes)] || { count: 0, status: 'unavailable' as EstadoMesIndex, lastUpdate: null, disponibleAPI: false };
                      return (
                        <td key={mes} className="py-1.5 px-0.5 min-w-[62px]">
                          <MesCell
                            año={año}
                            mes={mes}
                            count={mesInfo.count}
                            status={mesInfo.status}
                            lastUpdate={mesInfo.lastUpdate}
                            onScrape={scrapeMes}
                            isScraping={scrapingCells.has(`${año}-${mes}`) || fullYearScraping}
                          />
                        </td>
                      );
                    })}
                    <td className="py-1.5 pl-3">
                      <Button
                        variant="outline"
                        size="sm"
                        icon={fullYearScraping ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                        onClick={() => scrapeAño(año)}
                        disabled={fullYearScraping || scrapingCells.size > 0}
                        className="w-full"
                      >
                        {fullYearScraping ? 'Corriendo' : 'Año completo'}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="px-5 py-3 border-t border-gray-100 bg-amber-50 text-xs text-amber-800">
        ⚠️ El scraping requiere que tu PC tenga el proxy + tunnel activos. Cada mes toma ~1-3 min; un año completo ~15-30 min.
      </div>
    </Card>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className={clsx('w-3 h-3 rounded border', color)} />
      <span className="text-gray-600">{label}</span>
    </div>
  );
}
