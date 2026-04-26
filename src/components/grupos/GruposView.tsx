import { useEffect, useState } from 'react';
import {
  FolderKanban,
  RefreshCw,
  Loader2,
  AlertCircle,
  Search,
  Calendar,
  TrendingUp,
} from 'lucide-react';
import { clsx } from 'clsx';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import {
  listarGruposConStats,
  type GrupoConStats,
  type GrupoStats,
} from '../../services/api';
import { GrupoDetalleModal } from './GrupoDetalleModal';

function formatFecha(s: string): string {
  if (!s) return '—';
  try {
    const d = new Date(s);
    if (isNaN(d.getTime())) return s;
    return d.toLocaleDateString('es-PE');
  } catch {
    return s;
  }
}

/**
 * Compacta un monto grande en notación K/M.
 * Ej: 1500000 -> "1.5M", 252000 -> "252K"
 */
function formatSolesCompacto(v: number): string {
  if (!v || v <= 0) return '—';
  if (v >= 1_000_000) return 'S/ ' + (v / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (v >= 1_000) return 'S/ ' + Math.round(v / 1_000) + 'K';
  return 'S/ ' + v.toFixed(0);
}

interface ProgresoBarraProps {
  stats: GrupoStats;
}

function ProgresoBarra({ stats }: ProgresoBarraProps) {
  const total = stats.totalHistoricos || 0;
  if (total === 0) {
    return (
      <div className="text-xs text-gray-400">Sin históricos</div>
    );
  }

  const completos = stats.scrapeados || 0;
  const conError = stats.conError || 0;
  const pendientes = Math.max(0, total - completos - conError);

  // Porcentajes
  const pctCompleto = (completos / total) * 100;
  const pctError = (conError / total) * 100;
  const pctPendiente = (pendientes / total) * 100;

  return (
    <div>
      <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
        <span className="font-medium">Scraping</span>
        <span className="font-mono">
          {completos}/{total}
        </span>
      </div>
      <div className="flex h-2 rounded-full overflow-hidden bg-gray-100">
        {pctCompleto > 0 && (
          <div
            className="bg-emerald-500"
            style={{ width: `${pctCompleto}%` }}
            title={`${completos} completos`}
          />
        )}
        {pctError > 0 && (
          <div
            className="bg-red-500"
            style={{ width: `${pctError}%` }}
            title={`${conError} con error`}
          />
        )}
        {pctPendiente > 0 && (
          <div
            className="bg-gray-300"
            style={{ width: `${pctPendiente}%` }}
            title={`${pendientes} pendientes`}
          />
        )}
      </div>
      <div className="flex gap-2 mt-1 text-[11px] text-gray-500">
        {completos > 0 && (
          <span className="text-emerald-700">✓ {completos}</span>
        )}
        {conError > 0 && (
          <span className="text-red-700">⚠ {conError}</span>
        )}
        {pendientes > 0 && (
          <span className="text-gray-600">⏳ {pendientes}</span>
        )}
      </div>
    </div>
  );
}

interface GrupoCardProps {
  grupo: GrupoConStats;
  onClick: () => void;
}

function GrupoCard({ grupo, onClick }: GrupoCardProps) {
  const { stats } = grupo;
  const rangoAños =
    stats.añoMinimo && stats.añoMaximo && stats.añoMinimo !== stats.añoMaximo
      ? `${stats.añoMinimo}–${stats.añoMaximo}`
      : stats.añoMinimo
      ? String(stats.añoMinimo)
      : '—';

  return (
    <Card hover onClick={onClick}>
      <div className="p-4 space-y-3">
        {/* Nomenclatura */}
        <div>
          <p
            className="text-sm font-mono font-semibold text-gray-900 truncate"
            title={grupo.nomenclaturaActual}
          >
            {grupo.nomenclaturaActual}
          </p>
          <p className="text-[11px] text-gray-500 mt-0.5 flex items-center gap-1">
            <Calendar size={11} />
            Creado {formatFecha(grupo.fechaCreacion)}
          </p>
        </div>

        {/* Notas */}
        {grupo.notas && (
          <p
            className="text-xs text-gray-600 line-clamp-2"
            title={grupo.notas}
          >
            {grupo.notas}
          </p>
        )}

        {/* Stats principales */}
        <div className="flex items-center gap-3 text-xs text-gray-700 flex-wrap">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 font-medium">
            <FolderKanban size={12} />
            {stats.totalHistoricos} históricos
          </span>
          <span className="inline-flex items-center gap-1 text-gray-600">
            <Calendar size={12} />
            {rangoAños}
          </span>
        </div>

        {/* Barra de progreso scraping */}
        <ProgresoBarra stats={stats} />

        {/* Montos */}
        {stats.montoMedia > 0 ? (
          <div className="pt-2 border-t border-gray-100 flex items-center gap-1 text-[11px] text-gray-600 flex-wrap">
            <TrendingUp size={11} className="text-gray-400" />
            <span>
              Min <strong className="font-mono text-gray-900">{formatSolesCompacto(stats.montoMinimo)}</strong>
            </span>
            <span className="text-gray-300">·</span>
            <span>
              Máx <strong className="font-mono text-gray-900">{formatSolesCompacto(stats.montoMaximo)}</strong>
            </span>
            <span className="text-gray-300">·</span>
            <span>
              Media <strong className="font-mono text-gray-900">{formatSolesCompacto(stats.montoMedia)}</strong>
            </span>
          </div>
        ) : (
          <div className="pt-2 border-t border-gray-100 text-[11px] text-gray-400">
            Sin montos disponibles
          </div>
        )}
      </div>
    </Card>
  );
}

export function GruposView() {
  const [loading, setLoading] = useState(false);
  const [grupos, setGrupos] = useState<GrupoConStats[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedGrupo, setSelectedGrupo] = useState<string | null>(null);
  const [filtro, setFiltro] = useState('');

  async function cargar() {
    setLoading(true);
    setError(null);
    try {
      const r = await listarGruposConStats();
      if (r.success) {
        setGrupos(r.grupos || []);
      } else {
        setError(r.error || 'Error al cargar grupos');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const gruposFiltrados = filtro.trim()
    ? grupos.filter((g) => {
        const q = filtro.toLowerCase();
        return (
          g.nomenclaturaActual.toLowerCase().includes(q) ||
          (g.notas || '').toLowerCase().includes(q) ||
          g.nomenclaturasHistoricos.some((n) => n.toLowerCase().includes(q))
        );
      })
    : grupos;

  return (
    <div className="space-y-4">
      {/* Cabecera */}
      <Card>
        <div className="p-5">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-indigo-50 rounded-lg flex-shrink-0">
              <FolderKanban size={20} className="text-indigo-600" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">
                    Mis Grupos Históricos
                  </h2>
                  <p className="text-sm text-gray-500 mt-1">
                    Agrupaciones de procesos equivalentes que guardaste desde el
                    Buscador de Históricos. Acá ves estadísticas agregadas y el
                    estado de scraping de cada uno.
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={cargar}
                  loading={loading}
                  icon={<RefreshCw size={14} />}
                >
                  Recargar
                </Button>
              </div>

              {/* Buscador */}
              {grupos.length > 0 && (
                <div className="mt-3 relative max-w-md">
                  <Search
                    size={14}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                  />
                  <input
                    value={filtro}
                    onChange={(e) => setFiltro(e.target.value)}
                    placeholder="Buscar grupo por nomenclatura o notas…"
                    className="w-full pl-9 pr-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* Error */}
      {error && !loading && (
        <Card>
          <div className="p-5 flex items-start gap-3">
            <AlertCircle
              size={18}
              className="text-red-600 flex-shrink-0 mt-0.5"
            />
            <div className="flex-1">
              <p className="text-sm font-medium text-red-900">
                Error al cargar grupos
              </p>
              <p className="text-xs text-red-700 mt-0.5">{error}</p>
              <button
                onClick={cargar}
                className="text-xs font-medium text-red-700 hover:text-red-900 underline mt-2"
              >
                Reintentar
              </button>
            </div>
          </div>
        </Card>
      )}

      {/* Loading */}
      {loading && grupos.length === 0 && (
        <Card>
          <div className="p-12 flex flex-col items-center justify-center gap-2 text-gray-500">
            <Loader2 size={32} className="animate-spin text-indigo-600" />
            <p className="text-sm">Cargando grupos…</p>
          </div>
        </Card>
      )}

      {/* Empty state */}
      {!loading && !error && grupos.length === 0 && (
        <Card>
          <div className="p-12 flex flex-col items-center justify-center text-center gap-3">
            <div className="p-3 rounded-full bg-gray-100">
              <FolderKanban size={32} className="text-gray-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">
                No tenés grupos guardados todavía.
              </p>
              <p className="text-xs text-gray-500 mt-1 max-w-md">
                Buscá procesos equivalentes de años anteriores desde{' '}
                <a
                  href="/historicos"
                  className="text-indigo-600 hover:text-indigo-800 underline font-medium"
                >
                  Buscador de Históricos
                </a>{' '}
                y creá tu primer grupo.
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Empty con filtro */}
      {!loading && !error && grupos.length > 0 && gruposFiltrados.length === 0 && (
        <Card>
          <div className="p-8 text-center text-gray-500">
            <p className="text-sm">
              No hay grupos que coincidan con "
              <strong>{filtro}</strong>".
            </p>
          </div>
        </Card>
      )}

      {/* Grid de grupos */}
      {gruposFiltrados.length > 0 && (
        <div
          className={clsx(
            'grid gap-3 grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
            loading && 'opacity-60 pointer-events-none'
          )}
        >
          {gruposFiltrados.map((g) => (
            <GrupoCard
              key={g.idGrupo}
              grupo={g}
              onClick={() => setSelectedGrupo(g.idGrupo)}
            />
          ))}
        </div>
      )}

      {/* Modal detalle */}
      {selectedGrupo && (
        <GrupoDetalleModal
          idGrupo={selectedGrupo}
          onClose={() => {
            setSelectedGrupo(null);
            // Recargar por si hubo eliminación
            cargar();
          }}
        />
      )}
    </div>
  );
}
