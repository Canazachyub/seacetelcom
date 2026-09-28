import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BellRing, Radar, Star, Search, CalendarClock, Target, Clock } from 'lucide-react';
import { clsx } from 'clsx';
import { useStore } from '../../store/useStore';
import { Card, CardHeader, StatCard } from '../ui/Card';
import { Button } from '../ui/Button';
import { toast } from '../ui/Toast';
import { getDatosSeace, getCronogramasSeace } from '../../services/api';
import { formatSoles, formatFechaCorta, truncate } from '../../utils/format';
import { claveNomenclatura, evaluarProceso, MONTO, type NivelEntidad, type EvaluacionTelcom } from '../../utils/telcom';
import type { Proceso } from '../../types';

type FiltroNivel = 'NUCLEO' | 'NUCLEO_SEC' | 'TODAS';

const DIAS_DATOS_VIEJOS = 7;
const MAX_FILAS = 100;
const SALTO = String.fromCharCode(10);

const ESTILO_NIVEL: Record<NivelEntidad, string> = {
  NUCLEO: 'bg-emerald-100 text-emerald-800',
  ANILLO: 'bg-sky-100 text-sky-800',
  OTRA: 'bg-gray-100 text-gray-600',
};

function aFecha(v: unknown): Date | null {
  if (!v) return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  const s = String(v).trim();
  // dd/mm/yyyy [hh:mm] (formato SEACE)
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (m) {
    return new Date(+m[3], +m[2] - 1, +m[1], m[4] ? +m[4] : 23, m[5] ? +m[5] : 59);
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function diasHasta(fecha: Date): number {
  return Math.ceil((fecha.getTime() - Date.now()) / 86_400_000);
}

// ==================== HÁBIL / NO HÁBIL ====================

type EstadoHabil = 'HABIL' | 'PROXIMO' | 'NO_HABIL' | 'SIN_CRONOGRAMA';

interface Habilidad {
  estado: EstadoHabil;
  dias: number | null;
  presentacion: Date | null;
  registro: Date | null;
}

const RE_PRESENTACION = /PRESENTACI[OÓ]N DE (PROPUESTAS|OFERTAS)|PRESENTACION_PROPUESTAS|PRESENTACION_OFERTAS/i;
const RE_REGISTRO = /REGISTRO DE PARTICIPANTES|REGISTRO_PARTICIPANTES/i;
const DIAS_PROXIMO = 3;

/** Hábil = la presentación de ofertas aún no vence (si no hay esa etapa, se usa el registro). */
function calcularHabilidad(etapas: Array<{ etapa: string; fin: string }>): Habilidad {
  const fin = (re: RegExp) => {
    const et = etapas.find((e) => re.test(e.etapa));
    return et ? aFecha(et.fin) : null;
  };
  const presentacion = fin(RE_PRESENTACION);
  const registro = fin(RE_REGISTRO);
  const limite = presentacion ?? registro;
  if (!limite) return { estado: 'SIN_CRONOGRAMA', dias: null, presentacion, registro };
  const dias = diasHasta(limite);
  const estado: EstadoHabil = limite.getTime() < Date.now() ? 'NO_HABIL' : dias <= DIAS_PROXIMO ? 'PROXIMO' : 'HABIL';
  return { estado, dias, presentacion, registro };
}

/** Carga en una llamada los cronogramas de DATOS_SEACE. disponible=false si el Apps Script aún no tiene la acción. */
function useHabilidades() {
  const [estado, setEstado] = useState<{ disponible: boolean | null; mapa: Map<string, Habilidad> }>({
    disponible: null,
    mapa: new Map(),
  });
  useEffect(() => {
    let cancelado = false;
    getCronogramasSeace()
      .then((lista) => {
        if (cancelado) return;
        const mapa = new Map<string, Habilidad>();
        for (const c of lista) mapa.set(c.clave || claveNomenclatura(c.nomenclatura), calcularHabilidad(c.etapas));
        setEstado({ disponible: true, mapa });
      })
      .catch(() => !cancelado && setEstado({ disponible: false, mapa: new Map() }));
    return () => { cancelado = true; };
  }, []);
  return estado;
}

const SIN_DATO: Habilidad = { estado: 'SIN_CRONOGRAMA', dias: null, presentacion: null, registro: null };

function BadgeHabil({ h }: { h: Habilidad }) {
  if (h.estado === 'SIN_CRONOGRAMA') {
    return <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">Sin cronograma</span>;
  }
  if (h.estado === 'NO_HABIL') {
    return <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-200 text-gray-600">No hábil</span>;
  }
  const txt = h.dias === 0 ? 'vence HOY' : h.dias === 1 ? 'vence mañana' : `${h.dias} días`;
  return (
    <span
      className={clsx(
        'text-[11px] px-2 py-0.5 rounded-full font-semibold',
        h.estado === 'PROXIMO' ? 'bg-red-100 text-red-700' : 'bg-emerald-600 text-white'
      )}
      title={`Presentación: ${h.presentacion ? formatFechaCorta(h.presentacion) : '—'} · Registro: ${h.registro ? formatFechaCorta(h.registro) : '—'}`}
    >
      Hábil · {txt}
    </span>
  );
}

// ==================== ALERTAS ====================

interface Alerta {
  nomenclatura: string;
  etapa: string;
  fin: Date;
  dias: number;
}

interface EstadoAlertas {
  cargando: boolean;
  alertas: Alerta[];
  sinCronograma: string[];
}

/** Lee el cronograma guardado en DATOS_SEACE (scraper u OCDS) para cada proceso en seguimiento. */
function useAlertas(nomenclaturas: string[]): EstadoAlertas {
  const [estado, setEstado] = useState<EstadoAlertas>({ cargando: false, alertas: [], sinCronograma: [] });
  const clave = nomenclaturas.join('|');

  useEffect(() => {
    if (nomenclaturas.length === 0) return;
    let cancelado = false;
    setEstado((e) => ({ ...e, cargando: true }));

    Promise.all(
      nomenclaturas.map(async (nom) => {
        try {
          const datos = (await getDatosSeace(nom)) as unknown as Record<string, unknown> | null;
          let crono: unknown = datos?.cronograma ?? datos?.CRONOGRAMA_JSON;
          if (typeof crono === 'string') {
            try { crono = JSON.parse(crono); } catch { crono = []; }
          }
          return { nom, crono: Array.isArray(crono) ? (crono as Record<string, unknown>[]) : [] };
        } catch {
          return { nom, crono: [] as Record<string, unknown>[] };
        }
      })
    ).then((res) => {
      if (cancelado) return;
      const alertas: Alerta[] = [];
      const sinCronograma: string[] = [];
      for (const { nom, crono } of res) {
        if (crono.length === 0) {
          sinCronograma.push(nom);
          continue;
        }
        for (const et of crono) {
          const fin = aFecha(et.fechaFin ?? et.fecha_fin ?? et['Fecha Fin'] ?? et.fechaInicio);
          if (!fin) continue;
          const dias = diasHasta(fin);
          if (dias < 0) continue;
          alertas.push({
            nomenclatura: nom,
            etapa: String(et.etapaLabel ?? et.etapa ?? et.Etapa ?? 'Etapa'),
            fin,
            dias,
          });
        }
      }
      alertas.sort((a, b) => a.fin.getTime() - b.fin.getTime());
      setEstado({ cargando: false, alertas, sinCronograma });
    });

    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);

  return estado;
}

function PanelAlertas({ nomenclaturas }: { nomenclaturas: string[] }) {
  const { cargando, alertas, sinCronograma } = useAlertas(nomenclaturas);

  return (
    <Card>
      <CardHeader
        title="Alertas de plazos"
        subtitle="Próximas etapas de los procesos en seguimiento"
        icon={<BellRing className="w-5 h-5" />}
      />
      {nomenclaturas.length === 0 && (
        <p className="text-sm text-gray-500">No hay procesos en seguimiento. Márcalos con <Star className="inline w-3.5 h-3.5" /> en la tabla de abajo.</p>
      )}
      {cargando && <p className="text-sm text-gray-500">Leyendo cronogramas…</p>}
      {!cargando && alertas.length > 0 && (
        <ul className="divide-y divide-gray-100">
          {alertas.slice(0, 12).map((a, i) => (
            <li key={i} className="py-2 flex items-center gap-3">
              <span
                className={clsx(
                  'shrink-0 w-16 text-center text-xs font-semibold rounded px-1.5 py-1',
                  a.dias <= 1 ? 'bg-red-100 text-red-700' : a.dias <= 3 ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-700'
                )}
              >
                {a.dias === 0 ? 'HOY' : a.dias === 1 ? 'mañana' : `${a.dias} días`}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{a.etapa}</p>
                <p className="text-xs text-gray-500 truncate">
                  {a.nomenclatura} · vence {formatFechaCorta(a.fin)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
      {!cargando && nomenclaturas.length > 0 && alertas.length === 0 && sinCronograma.length === 0 && (
        <p className="text-sm text-gray-500">Ninguna etapa pendiente en los procesos en seguimiento.</p>
      )}
      {!cargando && sinCronograma.length > 0 && (
        <div className="mt-3 rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900">
          <p className="font-medium mb-1">
            {sinCronograma.length} proceso(s) sin cronograma en DATOS_SEACE:
          </p>
          <p className="font-mono break-all">{sinCronograma.join(', ')}</p>
          <p className="mt-1">
            Tráelo con el scraper:{' '}
            <code className="bg-white/70 px-1 rounded">python python\run.py --nomenclaturas "{sinCronograma[0]}"</code>
          </p>
        </div>
      )}
    </Card>
  );
}

// ==================== VISTA ====================

export function RadarView() {
  const procesos = useStore((s) => s.procesos);
  const seguimiento = useStore((s) => s.seguimiento);
  const agregarSeguimiento = useStore((s) => s.agregarSeguimiento);

  const [nivel, setNivel] = useState<FiltroNivel>('NUCLEO_SEC');
  const [soloGiro, setSoloGiro] = useState(true);
  const [anio, setAnio] = useState<string>('TODOS');
  const [texto, setTexto] = useState('');
  const [siguiendo, setSiguiendo] = useState<string | null>(null);
  const [soloHabiles, setSoloHabiles] = useState(false);
  const [orden, setOrden] = useState<'PUNTAJE' | 'VENCE'>('PUNTAJE');
  const habilidades = useHabilidades();

  const enSeguimiento = useMemo(
    () => new Set(seguimiento.map((s) => claveNomenclatura(s.NOMENCLATURA))),
    [seguimiento]
  );

  const evaluados = useMemo(
    () =>
      procesos.map((p) => {
        const hab = habilidades.mapa.get(claveNomenclatura(p.NOMENCLATURA)) ?? SIN_DATO;
        const abierto = hab.estado === 'HABIL' || hab.estado === 'PROXIMO';
        return { p, hab, ev: evaluarProceso(p, abierto ? hab.dias : null), fecha: aFecha(p.FECHA_PUB) };
      }),
    [procesos, habilidades.mapa]
  );

  const ultimaPublicacion = useMemo(() => {
    let max: Date | null = null;
    for (const { fecha } of evaluados) if (fecha && (!max || fecha > max)) max = fecha;
    return max;
  }, [evaluados]);
  const diasSinDatos = ultimaPublicacion ? -diasHasta(ultimaPublicacion) : null;

  const anios = useMemo(() => {
    const s = new Set<number>();
    evaluados.forEach(({ fecha }) => fecha && s.add(fecha.getFullYear()));
    return [...s].sort((a, b) => b - a);
  }, [evaluados]);

  const filtrados = useMemo(() => {
    const q = texto.trim().toUpperCase();
    return evaluados
      .filter(({ ev }) => (nivel === 'NUCLEO' ? ev.nivel === 'NUCLEO' : nivel === 'NUCLEO_SEC' ? ev.nivel !== 'OTRA' : true))
      .filter(({ ev }) => !soloGiro || ev.delGiro)
      .filter(({ hab }) => !soloHabiles || hab.estado === 'HABIL' || hab.estado === 'PROXIMO')
      .filter(({ fecha }) => anio === 'TODOS' || (fecha && String(fecha.getFullYear()) === anio))
      .filter(({ p }) => !q || `${p.NOMENCLATURA} ${p.DESCRIPCION} ${p.EMPRESA_CORTA}`.toUpperCase().includes(q))
      .sort((a, b) => {
        // Hábiles primero (el que vence antes, arriba); luego por fecha de publicación
        const ha = a.hab.estado === 'HABIL' || a.hab.estado === 'PROXIMO';
        const hb = b.hab.estado === 'HABIL' || b.hab.estado === 'PROXIMO';
        if (ha !== hb) return ha ? -1 : 1;
        if (ha && hb) {
          return orden === 'PUNTAJE'
            ? b.ev.puntaje - a.ev.puntaje || (a.hab.dias ?? 0) - (b.hab.dias ?? 0)
            : (a.hab.dias ?? 0) - (b.hab.dias ?? 0) || b.ev.puntaje - a.ev.puntaje;
        }
        return orden === 'PUNTAJE'
          ? b.ev.puntaje - a.ev.puntaje || (b.fecha?.getTime() ?? 0) - (a.fecha?.getTime() ?? 0)
          : (b.fecha?.getTime() ?? 0) - (a.fecha?.getTime() ?? 0) || b.ev.puntaje - a.ev.puntaje;
      });
  }, [evaluados, nivel, soloGiro, soloHabiles, anio, texto, orden]);

  const stats = useMemo(() => {
    const anioActual = new Date().getFullYear();
    let nucleoAnio = 0, giroAnio = 0, habiles = 0;
    for (const { ev, fecha, hab } of evaluados) {
      if (ev.nivel !== 'OTRA' && (hab.estado === 'HABIL' || hab.estado === 'PROXIMO')) habiles++;
      if (fecha?.getFullYear() !== anioActual) continue;
      if (ev.nivel === 'NUCLEO') nucleoAnio++;
      if (ev.nivel !== 'OTRA' && ev.delGiro) giroAnio++;
    }
    return { nucleoAnio, giroAnio, habiles, anioActual };
  }, [evaluados]);

  const seguir = async (p: Proceso, ev: EvaluacionTelcom) => {
    setSiguiendo(p.NOMENCLATURA);
    try {
      const lineas = ev.lineas.map((l) => `${l.id} ${l.nombre}`).join(', ') || '—';
      await agregarSeguimiento(
        p.NOMENCLATURA,
        'PENDIENTE',
        ev.puntaje >= 70 ? 'ALTA' : 'MEDIA',
        `Desde Radar · ${ev.puntaje}/100 · líneas: ${lineas}`
      );
      toast.success(`${p.NOMENCLATURA} agregado a Seguimiento`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo agregar a Seguimiento');
    } finally {
      setSiguiendo(null);
    }
  };

  return (
    <div className="space-y-4">
      {diasSinDatos !== null && diasSinDatos > DIAS_DATOS_VIEJOS && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-900">
          <AlertTriangle className="w-5 h-5 mt-0.5 shrink-0" />
          <div className="text-sm">
            <p className="font-semibold">
              Los datos llevan {diasSinDatos} días sin actualizarse (última convocatoria cargada: {formatFechaCorta(ultimaPublicacion)}).
            </p>
            <p className="mt-0.5">
              Las convocatorias nuevas no aparecen aquí. Corre <b>Scraping por Entidad</b> en SCRAPING-TELCOM para las entidades núcleo
              e importa <code className="bg-white/70 px-1 rounded">SEACE_IMPORT.csv</code> (ver docs/06).
            </p>
          </div>
        </div>
      )}

      {habilidades.disponible === false && (
        <div className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
          Para ver <b>hábil / no hábil</b> hay que publicar la versión nueva del Apps Script (acción <code>getCronogramasSeace</code>).
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Hábiles ahora" value={habilidades.disponible ? stats.habiles : '—'} icon={<CalendarClock className="w-5 h-5" />} color="red" />
        <StatCard title={`Núcleo · ${stats.anioActual}`} value={stats.nucleoAnio} icon={<Target className="w-5 h-5" />} color="green" />
        <StatCard title={`Del giro · ${stats.anioActual}`} value={stats.giroAnio} icon={<Radar className="w-5 h-5" />} color="blue" />
        <StatCard title="En seguimiento" value={seguimiento.length} icon={<Star className="w-5 h-5" />} color="yellow" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 items-start">
        <div className="xl:col-span-2">
          <Card padding="none">
            <div className="p-4 border-b border-gray-100 space-y-3">
              <CardHeader
                title="Convocatorias para Telcom"
                subtitle="Puntaje según nuestra experiencia real (docs/09): línea de servicio, entidad, monto y plazo."
                icon={<Radar className="w-5 h-5" />}
              />
              <div className="flex flex-wrap items-center gap-2">
                {([['NUCLEO', 'Núcleo'], ['NUCLEO_SEC', 'Núcleo + anillo'], ['TODAS', 'Todas']] as const).map(([v, l]) => (
                  <button
                    key={v}
                    onClick={() => setNivel(v)}
                    className={clsx(
                      'px-3 py-1.5 rounded-lg text-sm border',
                      nivel === v ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                    )}
                  >
                    {l}
                  </button>
                ))}
                <label className="flex items-center gap-1.5 text-sm text-gray-700 ml-1">
                  <input type="checkbox" checked={soloGiro} onChange={(e) => setSoloGiro(e.target.checked)} />
                  Solo con experiencia
                </label>
                <label className="flex items-center gap-1.5 text-sm text-gray-700">
                  <input type="checkbox" checked={soloHabiles} onChange={(e) => setSoloHabiles(e.target.checked)} />
                  Solo hábiles
                </label>
                <select
                  value={anio}
                  onChange={(e) => setAnio(e.target.value)}
                  className="px-2 py-1.5 rounded-lg text-sm border border-gray-200"
                >
                  <option value="TODOS">Todos los años</option>
                  {anios.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
                <select
                  value={orden}
                  onChange={(e) => setOrden(e.target.value as 'PUNTAJE' | 'VENCE')}
                  className="px-2 py-1.5 rounded-lg text-sm border border-gray-200"
                  title="Los hábiles van siempre primero"
                >
                  <option value="PUNTAJE">Ordenar: puntaje</option>
                  <option value="VENCE">Ordenar: vence primero</option>
                </select>
                <div className="relative flex-1 min-w-[180px]">
                  <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-gray-400" />
                  <input
                    value={texto}
                    onChange={(e) => setTexto(e.target.value)}
                    placeholder="Buscar nomenclatura o descripción"
                    className="w-full pl-8 pr-2 py-1.5 rounded-lg text-sm border border-gray-200"
                  />
                </div>
              </div>
              <p className="text-xs text-gray-500">
                {filtrados.length} procesos{filtrados.length > MAX_FILAS ? ` · se muestran los ${MAX_FILAS} más recientes` : ''}
              </p>
            </div>

            <ul className="divide-y divide-gray-100">
              {filtrados.slice(0, MAX_FILAS).map(({ p, ev, fecha, hab }) => {
                const seguido = enSeguimiento.has(claveNomenclatura(p.NOMENCLATURA));
                return (
                  <li key={`${p.ID}-${p.NOMENCLATURA}`} className="p-4 hover:bg-gray-50">
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-sm font-semibold text-gray-900">{p.NOMENCLATURA}</span>
                          <span className={clsx('text-xs px-2 py-0.5 rounded-full font-medium', ESTILO_NIVEL[ev.nivel])}>
                            {p.EMPRESA_CORTA || 'SIN EMPRESA'}
                          </span>
                          <BadgeHabil h={hab} />
                          <span className="text-xs text-gray-500 flex items-center gap-1">
                            <Clock className="w-3 h-3" /> {formatFechaCorta(fecha)}
                          </span>
                        </div>
                        <p className="text-sm text-gray-700 mt-1" title={p.DESCRIPCION}>{truncate(p.DESCRIPCION, 220)}</p>
                        {(ev.lineas.length > 0 || ev.excluido || ev.monto === 'CONSORCIO') && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {ev.lineas.map((l) => (
                              <span
                                key={l.id}
                                title={`Experiencia: ${l.experiencia}`}
                                className="text-[11px] px-1.5 py-0.5 rounded bg-violet-50 text-violet-700"
                              >
                                {l.id} · {l.nombre}
                              </span>
                            ))}
                            {ev.excluido && (
                              <span className="text-[11px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 line-through">
                                fuera del giro: {ev.excluido}
                              </span>
                            )}
                            {ev.competencia && ev.competencia.rivales.length > 0 && (
                              <span
                                className="text-[11px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-700"
                                title={ev.competencia.rivales
                                  .map((r) => `${r.nombre} (RUC ${r.ruc}) · ${r.procesos} proc.${r.pctVr !== null ? ` · ${r.pctVr}% VR` : ''}`)
                                  .join(SALTO)}
                              >
                                {ev.competencia.presentados > 0
                                  ? `Telcom ${ev.competencia.ganados}/${ev.competencia.presentados} aquí${ev.competencia.telcomPctVr !== null ? ` · ${ev.competencia.telcomPctVr}% VR` : ''} · ${ev.competencia.rivales.length} rivales`
                                  : `${ev.competencia.rivales.length} rivales conocidos`}
                              </span>
                            )}
                            {ev.monto === 'CONSORCIO' && (
                              <span className="text-[11px] px-1.5 py-0.5 rounded bg-orange-100 text-orange-800">
                                VR &gt; S/ {MONTO.CONSORCIO / 1_000_000} M · requiere consorcio
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="text-right shrink-0 space-y-1.5">
                        {Number(p.VALOR) > 0 ? (
                          <p className="text-sm font-semibold text-gray-900">{formatSoles(p.VALOR)}</p>
                        ) : (
                          <p className="text-xs text-gray-400">VR no publicado</p>
                        )}
                        <p
                          className={clsx(
                            'text-sm font-bold',
                            ev.puntaje >= 70 ? 'text-emerald-700' : ev.puntaje >= 50 ? 'text-amber-700' : 'text-gray-400'
                          )}
                          title={`Línea ${ev.desglose.linea}/40 · Entidad ${ev.desglose.entidad}/20 · Monto ${ev.desglose.monto}/20 · Rival ${ev.desglose.rival}/10 · Plazo ${ev.desglose.plazo}/10`}
                        >
                          {ev.puntaje}
                          <span className="text-xs font-normal text-gray-400">/100</span>
                        </p>
                        {seguido ? (
                          <span className="inline-flex items-center gap-1 text-xs text-amber-700">
                            <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-500" /> En seguimiento
                          </span>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            icon={<Star className="w-3.5 h-3.5" />}
                            loading={siguiendo === p.NOMENCLATURA}
                            onClick={() => seguir(p, ev)}
                          >
                            Seguir
                          </Button>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
              {filtrados.length === 0 && (
                <li className="p-8 text-center text-sm text-gray-500">Ningún proceso coincide con los filtros.</li>
              )}
            </ul>
          </Card>
        </div>

        <div className="space-y-4">
          <PanelAlertas nomenclaturas={seguimiento.map((s) => s.NOMENCLATURA)} />
          <Card>
            <CardHeader title="Cómo se puntúa" icon={<CalendarClock className="w-5 h-5" />} />
            <ul className="text-xs text-gray-600 space-y-1 list-disc pl-4">
              <li><b>Línea con experiencia propia</b> (40): A/B supervisión de contrastación y Proc. 227 · C reclamos · D pérdidas · E información para Osinergmin · F trabajos comerciales de campo.</li>
              <li><b>Entidad</b>: núcleo donde ya ganamos (20) — ELSE, Electrosur, Electro Ucayali; anillo (10) — Electro Puno, SEAL, Electro Oriente, Electrocentro, Enosa, Electronorte, Hidrandina, Adinelsa.</li>
              <li><b>Monto</b>: VR S/ 40k–1.2M (20) · hasta S/ 1.6M o no publicado (10) · más de S/ 2M requiere consorcio.</li>
              <li><b>Plazo</b>: 10 o más días para presentar (10).</li>
              <li>Excluidos (0): vigilancia, limpieza, adquisiciones, patrocinio legal, seguros, ejecución de obra.</li>
              <li><b>Rivales</b> (vault): Telcom ya ganó a todos los conocidos en la entidad (10) · rivales conocidos sin resultado frente a Telcom (5). Pasa el mouse por la etiqueta para ver RUC y % del VR.</li>
              <li>Todo en <code>src/utils/telcom.ts</code>; competencia con <code>scripts/sync_competencia.py</code>.</li>
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
