import { useEffect, useRef, useState } from 'react';
import {
  X,
  Loader2,
  AlertCircle,
  Calendar,
  Building2,
  FileText,
  Trash2,
  Download,
  ExternalLink,
  RefreshCw,
  CheckCircle2,
  Clock,
  TrendingUp,
  Image as ImageIcon,
  Upload,
  Sparkles,
} from 'lucide-react';
import { clsx } from 'clsx';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { toast } from '../ui/Toast';
import {
  getDetalleGrupo,
  deleteGrupoHistorico,
  sincronizarGrupoHistorico,
  guardarHistoricoExtraidoIA,
  getEstadoScrapingGrupo,
  type GrupoDetalleResponse,
  type HistoricoDetalle,
  type EstadoScraping,
  type EstadoScrapingItem,
} from '../../services/api';
import { geminiService } from '../../services/gemini';

interface Props {
  idGrupo: string;
  onClose: () => void;
}

function formatSoles(v: number): string {
  return v > 0
    ? 'S/ ' + v.toLocaleString('es-PE', { maximumFractionDigits: 0 })
    : '—';
}

function formatFecha(s: string | null | undefined): string {
  if (!s) return '—';
  try {
    const d = new Date(s);
    if (isNaN(d.getTime())) return s;
    return d.toLocaleDateString('es-PE');
  } catch {
    return s;
  }
}

const ESTADO_CONFIG: Record<
  EstadoScraping,
  { label: string; icon: string; className: string }
> = {
  completo: {
    label: 'Completo',
    icon: '✅',
    className: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  },
  en_proceso: {
    label: 'En proceso',
    icon: '🔄',
    className: 'bg-amber-100 text-amber-800 border-amber-300',
  },
  pendiente: {
    label: 'Pendiente',
    icon: '⏳',
    className: 'bg-gray-100 text-gray-700 border-gray-300',
  },
  error: {
    label: 'Error',
    icon: '⚠️',
    className: 'bg-red-100 text-red-800 border-red-300',
  },
};

function EstadoChip({ estado }: { estado: EstadoScraping }) {
  const cfg = ESTADO_CONFIG[estado] || ESTADO_CONFIG.pendiente;
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-medium whitespace-nowrap',
        cfg.className
      )}
    >
      <span>{cfg.icon}</span>
      <span>{cfg.label}</span>
    </span>
  );
}

type Tab = 'scraping' | 'capturas';

export function GrupoDetalleModal({ idGrupo, onClose }: Props) {
  const [data, setData] = useState<GrupoDetalleResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sincronizando, setSincronizando] = useState(false);
  const [eliminando, setEliminando] = useState(false);
  const [tab, setTab] = useState<Tab>('scraping');

  // Estado de la tab de capturas: una entrada por nomenclatura
  const [capturasPorNom, setCapturasPorNom] = useState<Record<string, File[]>>({});
  const [procesandoNom, setProcesandoNom] = useState<string | null>(null);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // Polling de estados de scraping
  const [polling, setPolling] = useState(false);
  const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastEstadosSnapshotRef = useRef<string>('');

  async function cargar() {
    setLoading(true);
    setError(null);
    try {
      const r = await getDetalleGrupo(idGrupo);
      if (r.success) {
        setData(r);
      } else {
        setError(r.error || 'Error al cargar detalle del grupo');
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
  }, [idGrupo]);

  // Cerrar con ESC
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // Polling automático de estados de scraping cada 8s mientras el modal esté abierto.
  // Arranca solo tras el primer fetch exitoso y se detiene si todos completo/error.
  useEffect(() => {
    // No pollear si no hay data válida o si hay error/loading iniciales
    if (loading || error || !data || data.historicos.length === 0) {
      return;
    }

    // Seed del snapshot con el estado actual para no disparar cargar() en el primer tick
    const seedSnapshot = JSON.stringify(
      data.historicos
        .map((h) => ({ nom: h.nomenclatura, estado: h.scraping.estado }))
        .sort((a, b) => a.nom.localeCompare(b.nom))
    );
    lastEstadosSnapshotRef.current = seedSnapshot;

    // Si ya están todos completo/error, no arrancar polling
    const allDone = data.historicos.every(
      (h) => h.scraping.estado === 'completo' || h.scraping.estado === 'error'
    );
    if (allDone) {
      setPolling(false);
      return;
    }

    setPolling(true);

    const tick = async (): Promise<void> => {
      try {
        const res = await getEstadoScrapingGrupo(idGrupo);
        if (!res.success) return;

        const estados: EstadoScrapingItem[] = res.estados;

        // Snapshot ordenado por nomenclatura para comparar
        const snapshot = JSON.stringify(
          [...estados]
            .map((e) => ({ nom: e.nomenclatura, estado: e.estado }))
            .sort((a, b) => a.nom.localeCompare(b.nom))
        );

        if (snapshot !== lastEstadosSnapshotRef.current) {
          lastEstadosSnapshotRef.current = snapshot;
          // Algo cambió → recargar detalle completo (stats, numPostores, numPdfs)
          cargar();
        }

        // Si todos están completo/error, detener polling
        const done = estados.every(
          (e) => e.estado === 'completo' || e.estado === 'error'
        );
        if (done && pollingIntervalRef.current !== null) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
          setPolling(false);
        }
      } catch (e) {
        // Silencioso: no romper la UI por errores de red transitorios
        console.warn('[polling grupo] error', e);
      }
    };

    const intervalId = setInterval(() => {
      void tick();
    }, 8000);
    pollingIntervalRef.current = intervalId;

    return () => {
      if (pollingIntervalRef.current !== null) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
      setPolling(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idGrupo, loading, error, data]);

  async function sincronizar() {
    if (!data) return;
    setSincronizando(true);
    try {
      const r = await sincronizarGrupoHistorico(data.nomenclaturaActual);
      if (r.success) {
        toast.success(
          r.mensaje ||
            `Sincronizados ${r.totalHistoricos ?? 0} históricos · ${
              r.totalEtapasActualizadas ?? 0
            } etapas`
        );
        // Re-cargar para ver estados actualizados
        cargar();
      } else {
        toast.error(r.error || 'Error al sincronizar');
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSincronizando(false);
    }
  }

  async function eliminar() {
    if (!data) return;
    const ok = window.confirm(
      `¿Eliminar el grupo "${data.nomenclaturaActual}"?\n\n` +
        `Esto desvincula los ${data.historicos.length} históricos asociados. ` +
        `Los datos scrapeados NO se borran.`
    );
    if (!ok) return;

    setEliminando(true);
    try {
      const r = await deleteGrupoHistorico(idGrupo);
      if (r.success) {
        toast.success('Grupo eliminado');
        onClose();
      } else {
        toast.error('No se pudo eliminar el grupo');
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setEliminando(false);
    }
  }

  function handleSelectImages(nom: string, files: FileList | null) {
    if (!files) return;
    const arr = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (arr.length === 0) {
      toast.warning('Selecciona imágenes (PNG, JPG, WEBP).');
      return;
    }
    if (arr.length > 3) {
      toast.warning('Máximo 3 imágenes. Se usarán las primeras 3.');
    }
    setCapturasPorNom((s) => ({ ...s, [nom]: arr.slice(0, 3) }));
  }

  function quitarImagenes(nom: string) {
    setCapturasPorNom((s) => {
      const copy = { ...s };
      delete copy[nom];
      return copy;
    });
    const input = fileInputRefs.current[nom];
    if (input) input.value = '';
  }

  async function extraerYGuardar(nom: string) {
    const imgs = capturasPorNom[nom] || [];
    if (imgs.length === 0) {
      toast.warning('Selecciona al menos una imagen.');
      return;
    }
    setProcesandoNom(nom);
    try {
      const extraido = await geminiService.extraerDatosSEACE(imgs, nom);

      // El histórico ya tiene nomenclatura fija, así que la forzamos
      // (Gemini a veces inventa o deja campos vacíos)
      const añoMatch = nom.match(/-(\d{4})-/);
      const año = añoMatch
        ? parseInt(añoMatch[1])
        : extraido.año || new Date().getFullYear();

      const payload = {
        ...extraido,
        nomenclatura: nom,
        año,
      };

      const res = await guardarHistoricoExtraidoIA(payload);
      if (res.success) {
        toast.success(
          res.accion === 'actualizado'
            ? `Histórico ${nom} actualizado`
            : `Histórico ${nom} guardado`
        );
        quitarImagenes(nom);
        cargar();
      } else {
        toast.error(res.error || res.mensaje || 'No se pudo guardar');
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`Error al extraer: ${msg}`);
    } finally {
      setProcesandoNom(null);
    }
  }

  // Stats agregadas derivadas de los históricos
  const stats = (() => {
    if (!data || data.historicos.length === 0) return null;
    const valores = data.historicos.map((h) => h.valor).filter((v) => v > 0);
    const años = data.historicos
      .map((h) => {
        if (!h.fechaPub) return null;
        const d = new Date(h.fechaPub);
        return isNaN(d.getTime()) ? null : d.getFullYear();
      })
      .filter((a): a is number => a !== null);
    const scrapeados = data.historicos.filter(
      (h) => h.scraping.estado === 'completo'
    ).length;
    const enProceso = data.historicos.filter(
      (h) => h.scraping.estado === 'en_proceso'
    ).length;
    const pendientes = data.historicos.filter(
      (h) => h.scraping.estado === 'pendiente'
    ).length;
    const conError = data.historicos.filter(
      (h) => h.scraping.estado === 'error'
    ).length;
    return {
      total: data.historicos.length,
      añoMin: años.length > 0 ? Math.min(...años) : null,
      añoMax: años.length > 0 ? Math.max(...años) : null,
      montoMin: valores.length > 0 ? Math.min(...valores) : 0,
      montoMax: valores.length > 0 ? Math.max(...valores) : 0,
      montoMedia:
        valores.length > 0
          ? valores.reduce((a, b) => a + b, 0) / valores.length
          : 0,
      scrapeados,
      enProceso,
      pendientes,
      conError,
    };
  })();

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="w-full max-w-5xl my-4"
        onClick={(e) => e.stopPropagation()}
      >
        <Card>
          <div className="flex flex-col max-h-[90vh]">
            {/* Header sticky */}
            <div className="sticky top-0 z-10 bg-white border-b border-gray-200 rounded-t-xl px-5 py-4 flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">
                  Detalle del grupo
                </p>
                <p
                  className="text-base font-mono font-semibold text-gray-900 mt-0.5 truncate"
                  title={data?.nomenclaturaActual || ''}
                >
                  {data?.nomenclaturaActual || idGrupo}
                </p>
                {data?.fechaCreacion && (
                  <p className="text-[11px] text-gray-500 mt-1 flex items-center gap-1">
                    <Calendar size={11} />
                    Creado {formatFecha(data.fechaCreacion)}
                  </p>
                )}
                {polling &&
                  data?.historicos.some(
                    (h) =>
                      h.scraping.estado === 'pendiente' ||
                      h.scraping.estado === 'en_proceso'
                  ) && (
                    <p className="text-[11px] text-gray-500 mt-1 flex items-center gap-1">
                      <Loader2 size={12} className="animate-spin" />
                      Actualizando…
                    </p>
                  )}
              </div>
              <button
                onClick={onClose}
                className="flex-shrink-0 p-1.5 rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition"
                aria-label="Cerrar"
              >
                <X size={18} />
              </button>
            </div>

            {/* Body scrollable */}
            <div className="flex-1 overflow-y-auto">
              {loading && (
                <div className="p-12 flex flex-col items-center justify-center gap-2 text-gray-500">
                  <Loader2 size={28} className="animate-spin text-indigo-600" />
                  <p className="text-sm">Cargando detalle…</p>
                </div>
              )}

              {error && !loading && (
                <div className="p-6">
                  <div className="flex items-start gap-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                    <AlertCircle
                      size={16}
                      className="text-red-600 flex-shrink-0 mt-0.5"
                    />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-red-900">
                        Error al cargar
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
                </div>
              )}

              {!loading && !error && data && (
                <div className="p-5 space-y-4">
                  {/* Tabs */}
                  <div className="flex items-center gap-1 border-b border-gray-200">
                    <button
                      onClick={() => setTab('scraping')}
                      className={clsx(
                        'px-3 py-2 text-xs font-medium border-b-2 transition-colors -mb-px flex items-center gap-1.5',
                        tab === 'scraping'
                          ? 'border-indigo-600 text-indigo-700'
                          : 'border-transparent text-gray-600 hover:text-gray-900'
                      )}
                    >
                      <Download size={13} />
                      Scraping automático
                    </button>
                    <button
                      onClick={() => setTab('capturas')}
                      className={clsx(
                        'px-3 py-2 text-xs font-medium border-b-2 transition-colors -mb-px flex items-center gap-1.5',
                        tab === 'capturas'
                          ? 'border-indigo-600 text-indigo-700'
                          : 'border-transparent text-gray-600 hover:text-gray-900'
                      )}
                    >
                      <ImageIcon size={13} />
                      Extracción manual (capturas)
                    </button>
                  </div>

                  {/* Notas */}
                  {data.notas && (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                      <p className="text-[11px] font-medium text-amber-900 uppercase tracking-wide mb-0.5">
                        Notas
                      </p>
                      <p className="text-xs text-amber-800 whitespace-pre-wrap">
                        {data.notas}
                      </p>
                    </div>
                  )}

                  {/* Stats agregadas */}
                  {stats && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      <div className="p-3 rounded-lg bg-indigo-50 border border-indigo-100">
                        <p className="text-[11px] font-medium text-indigo-700 uppercase tracking-wide">
                          Históricos
                        </p>
                        <p className="text-lg font-bold text-indigo-900 mt-0.5">
                          {stats.total}
                        </p>
                        {stats.añoMin && stats.añoMax && (
                          <p className="text-[11px] text-indigo-700 mt-0.5 font-mono">
                            {stats.añoMin === stats.añoMax
                              ? stats.añoMin
                              : `${stats.añoMin}–${stats.añoMax}`}
                          </p>
                        )}
                      </div>
                      <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-100">
                        <p className="text-[11px] font-medium text-emerald-700 uppercase tracking-wide flex items-center gap-1">
                          <CheckCircle2 size={11} /> Scrapeados
                        </p>
                        <p className="text-lg font-bold text-emerald-900 mt-0.5">
                          {stats.scrapeados}
                          <span className="text-xs font-normal text-emerald-700">
                            {' '}
                            / {stats.total}
                          </span>
                        </p>
                      </div>
                      <div className="p-3 rounded-lg bg-gray-50 border border-gray-200">
                        <p className="text-[11px] font-medium text-gray-600 uppercase tracking-wide flex items-center gap-1">
                          <Clock size={11} /> Pendientes
                        </p>
                        <p className="text-lg font-bold text-gray-900 mt-0.5">
                          {stats.pendientes + stats.enProceso}
                          {stats.conError > 0 && (
                            <span className="text-xs text-red-600 font-medium ml-2">
                              · {stats.conError} error
                            </span>
                          )}
                        </p>
                      </div>
                      <div className="p-3 rounded-lg bg-purple-50 border border-purple-100">
                        <p className="text-[11px] font-medium text-purple-700 uppercase tracking-wide flex items-center gap-1">
                          <TrendingUp size={11} /> Valor medio
                        </p>
                        <p className="text-lg font-bold text-purple-900 mt-0.5 font-mono">
                          {formatSoles(stats.montoMedia)}
                        </p>
                        {stats.montoMin > 0 && (
                          <p className="text-[11px] text-purple-700 mt-0.5">
                            {formatSoles(stats.montoMin)} – {formatSoles(stats.montoMax)}
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Tabla de históricos (solo tab scraping) */}
                  {tab === 'scraping' && (data.historicos.length === 0 ? (
                    <div className="p-8 text-center text-gray-500">
                      <FileText
                        size={32}
                        className="text-gray-300 mx-auto mb-2"
                      />
                      <p className="text-sm">
                        Este grupo no tiene históricos asociados.
                      </p>
                    </div>
                  ) : (
                    <div className="border border-gray-200 rounded-lg overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead className="bg-gray-50 border-b border-gray-200">
                            <tr className="text-left">
                              <th className="py-2 px-3 font-medium text-gray-600">
                                Nomenclatura
                              </th>
                              <th className="py-2 px-3 font-medium text-gray-600 w-14">
                                Año
                              </th>
                              <th className="py-2 px-3 font-medium text-gray-600">
                                Entidad
                              </th>
                              <th className="py-2 px-3 font-medium text-gray-600">
                                Descripción
                              </th>
                              <th className="py-2 px-3 font-medium text-gray-600 text-right w-24">
                                Valor
                              </th>
                              <th className="py-2 px-3 font-medium text-gray-600 w-20">
                                Tipo
                              </th>
                              <th className="py-2 px-3 font-medium text-gray-600 w-28">
                                Estado
                              </th>
                              <th className="py-2 px-3 font-medium text-gray-600 text-center w-16">
                                📄 PDFs
                              </th>
                              <th className="py-2 px-3 font-medium text-gray-600 text-center w-16">
                                👥 Post.
                              </th>
                              <th className="py-2 px-3 font-medium text-gray-600 w-24">
                                Acciones
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {data.historicos.map((h: HistoricoDetalle) => {
                              const año = h.fechaPub
                                ? (() => {
                                    const d = new Date(h.fechaPub);
                                    return isNaN(d.getTime())
                                      ? '—'
                                      : d.getFullYear();
                                  })()
                                : '—';
                              const esCompleto = h.scraping.estado === 'completo';
                              return (
                                <tr
                                  key={h.nomenclatura}
                                  className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
                                >
                                  <td className="py-2 px-3 font-mono text-gray-900">
                                    <div
                                      className="truncate max-w-[180px]"
                                      title={h.nomenclatura}
                                    >
                                      {esCompleto && (
                                        <CheckCircle2
                                          size={11}
                                          className="inline text-emerald-600 mr-1"
                                        />
                                      )}
                                      {h.nomenclatura}
                                    </div>
                                  </td>
                                  <td className="py-2 px-3 font-mono font-semibold text-gray-900">
                                    {año}
                                  </td>
                                  <td className="py-2 px-3 text-gray-700">
                                    <div
                                      className="truncate max-w-[150px] flex items-center gap-1"
                                      title={h.entidad}
                                    >
                                      <Building2
                                        size={11}
                                        className="text-gray-400 flex-shrink-0"
                                      />
                                      <span className="truncate">
                                        {h.entidad || '—'}
                                      </span>
                                    </div>
                                  </td>
                                  <td className="py-2 px-3 text-gray-700 max-w-[240px]">
                                    <div
                                      className="line-clamp-2"
                                      title={h.descripcion}
                                    >
                                      {h.descripcion || '—'}
                                    </div>
                                  </td>
                                  <td className="py-2 px-3 text-right font-mono text-gray-700">
                                    {formatSoles(h.valor)}
                                  </td>
                                  <td className="py-2 px-3 text-gray-600">
                                    {h.tipoServicio ? (
                                      <span className="inline-flex px-1.5 py-0.5 text-[10px] font-medium rounded bg-purple-50 text-purple-700 truncate max-w-[90px]">
                                        {h.tipoServicio}
                                      </span>
                                    ) : (
                                      '—'
                                    )}
                                  </td>
                                  <td className="py-2 px-3">
                                    <EstadoChip estado={h.scraping.estado} />
                                    {h.scraping.error && (
                                      <div
                                        className="text-[10px] text-red-600 italic mt-0.5 truncate max-w-[120px]"
                                        title={h.scraping.error}
                                      >
                                        {h.scraping.error}
                                      </div>
                                    )}
                                  </td>
                                  <td className="py-2 px-3 text-center font-mono text-gray-700">
                                    {esCompleto ? h.scraping.numPdfs : '—'}
                                  </td>
                                  <td className="py-2 px-3 text-center font-mono text-gray-700">
                                    {esCompleto ? h.scraping.numPostores : '—'}
                                  </td>
                                  <td className="py-2 px-3">
                                    <div className="flex items-center gap-1">
                                      {h.scraping.urlSeace ? (
                                        <a
                                          href={h.scraping.urlSeace}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="p-1 rounded hover:bg-indigo-50 text-indigo-600"
                                          title="Ver en SEACE"
                                        >
                                          <ExternalLink size={13} />
                                        </a>
                                      ) : (
                                        <span
                                          className="p-1 text-gray-300"
                                          title="Sin URL SEACE"
                                        >
                                          <ExternalLink size={13} />
                                        </span>
                                      )}
                                      <button
                                        disabled
                                        className="p-1 rounded text-gray-300 cursor-not-allowed"
                                        title="Scrapear — Disponible en Fase 2"
                                      >
                                        <Download size={13} />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}

                  {/* Tab: extracción manual con capturas */}
                  {tab === 'capturas' && (
                    <div className="space-y-3">
                      <div className="p-3 rounded-lg bg-indigo-50 border border-indigo-100 text-xs text-indigo-900">
                        <p className="font-medium mb-1">💡 Cómo funciona</p>
                        <ol className="list-decimal list-inside space-y-0.5 text-indigo-800">
                          <li>Para cada histórico pendiente, sube hasta 3 capturas de la ficha SEACE (ficha general, postores, consultas).</li>
                          <li>Gemini Vision extrae postores, montos ofertados, consultas y cronograma.</li>
                          <li>Se guarda automáticamente en el grupo — la tab "Scraping" se actualiza al estado <b>completo</b>.</li>
                        </ol>
                      </div>

                      {data.historicos.length === 0 ? (
                        <div className="p-8 text-center text-gray-500 border border-dashed border-gray-200 rounded-lg">
                          <FileText size={32} className="text-gray-300 mx-auto mb-2" />
                          <p className="text-sm">Este grupo no tiene históricos.</p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {data.historicos.map((h) => {
                            const yaCompleto = h.scraping.estado === 'completo';
                            const imgs = capturasPorNom[h.nomenclatura] || [];
                            const procesando = procesandoNom === h.nomenclatura;

                            return (
                              <div
                                key={h.nomenclatura}
                                className={clsx(
                                  'border rounded-lg p-3 transition-colors',
                                  yaCompleto
                                    ? 'border-emerald-200 bg-emerald-50/40'
                                    : 'border-gray-200 bg-white'
                                )}
                              >
                                <div className="flex items-start justify-between gap-3 mb-2">
                                  <div className="min-w-0 flex-1">
                                    <p className="font-mono text-xs font-semibold text-gray-900 truncate" title={h.nomenclatura}>
                                      {h.nomenclatura}
                                    </p>
                                    <p className="text-[11px] text-gray-600 truncate" title={h.descripcion}>
                                      {h.descripcion || h.entidad || '—'}
                                    </p>
                                  </div>
                                  <EstadoChip estado={h.scraping.estado} />
                                </div>

                                {yaCompleto ? (
                                  <div className="flex items-center gap-3 text-[11px] text-emerald-800">
                                    <span className="flex items-center gap-1">
                                      <CheckCircle2 size={12} />
                                      Ya tiene datos ({h.scraping.numPostores || 0} postores · {h.scraping.numPdfs || 0} docs)
                                    </span>
                                    <button
                                      onClick={() => fileInputRefs.current[h.nomenclatura]?.click()}
                                      className="text-indigo-700 hover:text-indigo-900 underline"
                                    >
                                      Re-extraer
                                    </button>
                                  </div>
                                ) : null}

                                <div className="flex items-center gap-2 flex-wrap mt-2">
                                  <input
                                    ref={(el) => {
                                      fileInputRefs.current[h.nomenclatura] = el;
                                    }}
                                    type="file"
                                    accept="image/*"
                                    multiple
                                    onChange={(e) => handleSelectImages(h.nomenclatura, e.target.files)}
                                    className="hidden"
                                  />
                                  {imgs.length === 0 ? (
                                    <button
                                      onClick={() => fileInputRefs.current[h.nomenclatura]?.click()}
                                      className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium rounded-md border border-dashed border-gray-300 text-gray-700 hover:border-indigo-400 hover:text-indigo-700 hover:bg-indigo-50 transition-colors"
                                    >
                                      <Upload size={12} />
                                      Seleccionar capturas (máx 3)
                                    </button>
                                  ) : (
                                    <>
                                      <div className="flex items-center gap-1 flex-wrap">
                                        {imgs.map((f, i) => (
                                          <span
                                            key={i}
                                            className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-mono rounded bg-indigo-100 text-indigo-800 border border-indigo-200 max-w-[200px]"
                                            title={f.name}
                                          >
                                            <ImageIcon size={10} />
                                            <span className="truncate">{f.name}</span>
                                          </span>
                                        ))}
                                      </div>
                                      <Button
                                        size="sm"
                                        onClick={() => extraerYGuardar(h.nomenclatura)}
                                        loading={procesando}
                                        icon={<Sparkles size={12} />}
                                      >
                                        Extraer con IA
                                      </Button>
                                      <button
                                        onClick={() => quitarImagenes(h.nomenclatura)}
                                        disabled={procesando}
                                        className="text-[11px] text-gray-500 hover:text-red-600 underline disabled:opacity-40"
                                      >
                                        Quitar
                                      </button>
                                    </>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer sticky */}
            {!loading && !error && data && (
              <div className="sticky bottom-0 bg-white border-t border-gray-200 rounded-b-xl px-5 py-3 flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={sincronizar}
                    loading={sincronizando}
                    icon={<RefreshCw size={14} />}
                  >
                    Sincronizar con OCDS
                  </Button>
                  <div
                    title="Disponible en Fase 2"
                    className="inline-flex"
                  >
                    <Button
                      size="sm"
                      variant="outline"
                      disabled
                      icon={<Download size={14} />}
                    >
                      Scrapear todos los pendientes
                    </Button>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={eliminar}
                  loading={eliminando}
                  icon={<Trash2 size={14} />}
                  className="!text-red-600 !border-red-300 hover:!bg-red-50"
                >
                  Eliminar grupo
                </Button>
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
