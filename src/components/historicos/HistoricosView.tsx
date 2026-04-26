import { useState, useMemo } from 'react';
import {
  Search,
  Sparkles,
  Loader2,
  AlertCircle,
  ArrowRight,
  Building2,
  FileText,
  Hash,
  CheckCircle2,
} from 'lucide-react';
import { clsx } from 'clsx';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { toast } from '../ui/Toast';
import {
  buscarHistoricosCandidatos,
  crearGrupoHistorico,
  type HistoricoCandidato,
  type BuscarHistoricosResponse,
} from '../../services/api';
import { deepseekService } from '../../services/deepseek';
import { useStore } from '../../store/useStore';

type Stage = 'idle' | 'searching' | 'rerankeo' | 'done';
type OrdenBy = 'score' | 'año' | 'valor';
type Modo = 'descripcion' | 'nomenclatura';

function formatSoles(v: number | null | undefined): string {
  if (!v || v === 0) return '—';
  return 'S/ ' + v.toLocaleString('es-PE', { maximumFractionDigits: 0 });
}

function scoreColor(score: number): string {
  if (score >= 85) return 'bg-emerald-100 text-emerald-800 border-emerald-300';
  if (score >= 70) return 'bg-teal-100 text-teal-800 border-teal-300';
  if (score >= 50) return 'bg-amber-100 text-amber-800 border-amber-300';
  return 'bg-gray-100 text-gray-600 border-gray-300';
}

function scoreLabel(score: number): string {
  if (score >= 85) return 'Alta';
  if (score >= 70) return 'Buena';
  if (score >= 50) return 'Media';
  return 'Baja';
}

export function HistoricosView() {
  const [modo, setModo] = useState<Modo>('descripcion');
  const [nomenclatura, setNomenclatura] = useState('');
  const [descripcionManual, setDescripcionManual] = useState('');
  const [entidadManual, setEntidadManual] = useState('');
  const [nomenclaturaParaGuardar, setNomenclaturaParaGuardar] = useState('');
  const [stage, setStage] = useState<Stage>('idle');
  const [error, setError] = useState<string | null>(null);
  const [target, setTarget] = useState<BuscarHistoricosResponse['target'] | null>(null);
  const [keywordsBackend, setKeywordsBackend] = useState<string[]>([]);
  const [candidatos, setCandidatos] = useState<HistoricoCandidato[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [orden, setOrden] = useState<OrdenBy>('score');
  const [guardando, setGuardando] = useState(false);
  const [grupoCreadoId, setGrupoCreadoId] = useState<string | null>(null);
  const setVistaActiva = useStore((s: any) => s.setVistaActiva);

  const loading = stage === 'searching' || stage === 'rerankeo';

  const candidatosOrdenados = useMemo(() => {
    const sorted = [...candidatos];
    if (orden === 'score') {
      sorted.sort((a, b) => {
        const sa = a.llmScore ?? a.score;
        const sb = b.llmScore ?? b.score;
        if (sb !== sa) return sb - sa;
        return b.año - a.año;
      });
    } else if (orden === 'año') {
      sorted.sort((a, b) => b.año - a.año);
    } else if (orden === 'valor') {
      sorted.sort((a, b) => (b.valor || 0) - (a.valor || 0));
    }
    return sorted;
  }, [candidatos, orden]);

  async function buscar() {
    // Validar inputs según modo
    let nomParam = '';
    let descParam: string | undefined;
    let entParam: string | undefined;

    if (modo === 'nomenclatura') {
      nomParam = nomenclatura.trim();
      if (!nomParam) {
        toast.error('Pegá una nomenclatura');
        return;
      }
    } else {
      descParam = descripcionManual.trim();
      entParam = entidadManual.trim();
      if (!descParam || !entParam) {
        toast.error('Completá descripción + entidad');
        return;
      }
    }

    setError(null);
    setStage('searching');
    setTarget(null);
    setCandidatos([]);
    setSelected(new Set());

    try {
      const r = await buscarHistoricosCandidatos(nomParam, {
        descripcion: descParam,
        entidad: entParam,
      });
      if (!r.success) {
        setError(r.error || 'No se pudo buscar');
        setStage('idle');
        return;
      }

      setTarget(r.target);
      setKeywordsBackend(r.keywordsExtraidos);

      if (r.candidatos.length === 0) {
        setCandidatos([]);
        setStage('done');
        toast.info('No se encontraron candidatos. Probá ampliar la descripción.');
        return;
      }

      // Re-rankeo LLM
      setStage('rerankeo');
      setCandidatos(r.candidatos); // muestra mientras tanto con score base

      try {
        const reranks = await deepseekService.rerankearHistoricos(
          { descripcion: r.target.descripcion, entidad: r.target.entidad },
          r.candidatos.map((c) => ({
            nomenclatura: c.nomenclatura,
            descripcion: c.descripcion,
            año: c.año,
          }))
        );
        const byNom = new Map(reranks.map((rk) => [rk.nomenclatura, rk]));
        const merged = r.candidatos.map((c) => {
          const rk = byNom.get(c.nomenclatura);
          return rk ? { ...c, llmScore: rk.llmScore, llmRazon: rk.llmRazon } : c;
        });
        setCandidatos(merged);
      } catch (e) {
        console.warn('LLM rerank falló, mostrando scores base:', e);
      }

      setStage('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStage('idle');
    }
  }

  function toggleSelect(nom: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(nom)) next.delete(nom);
      else next.add(nom);
      return next;
    });
  }

  function selectAllWithScore(minScore: number) {
    const nuevas = new Set(selected);
    for (const c of candidatos) {
      const s = c.llmScore ?? c.score;
      if (s >= minScore) nuevas.add(c.nomenclatura);
    }
    setSelected(nuevas);
  }

  async function guardarGrupo() {
    if (selected.size === 0) {
      toast.error('Marcá al menos un histórico');
      return;
    }

    // Determinar nomenclatura actual (target real o ingresada manualmente)
    const nomActual = target?.nomenclatura?.trim() || nomenclaturaParaGuardar.trim();
    if (!nomActual) {
      toast.error('Ingresá la nomenclatura del proceso actual para guardar el grupo');
      return;
    }

    setGuardando(true);
    try {
      const r = await crearGrupoHistorico(
        nomActual,
        Array.from(selected),
        undefined,
        `Keywords: ${keywordsBackend.join(', ')}`,
      );
      if (r.success) {
        toast.success(`Grupo creado con ${selected.size} históricos`);
        setGrupoCreadoId(r.idGrupo || null);
        // NO limpiar selected todavía, el usuario puede querer verlos
        // setSelected(new Set());
      } else {
        toast.error('Error: ' + (r.error || 'desconocido'));
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setGuardando(false);
    }
  }

  const statsSeleccion = useMemo(() => {
    if (selected.size === 0) return null;
    const sel = candidatos.filter((c) => selected.has(c.nomenclatura));
    const valores = sel.map((c) => c.valor).filter((v) => v > 0);
    if (valores.length === 0) return { count: sel.length, min: 0, max: 0, media: 0 };
    const min = Math.min(...valores);
    const max = Math.max(...valores);
    const media = valores.reduce((a, b) => a + b, 0) / valores.length;
    return { count: sel.length, min, max, media };
  }, [selected, candidatos]);

  return (
    <div className="space-y-4">
      {/* Buscador */}
      <Card>
        <div className="p-5">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-indigo-50 rounded-lg flex-shrink-0">
              <Sparkles size={20} className="text-indigo-600" />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-semibold text-gray-900">
                Buscador de Históricos
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                Pegá la nomenclatura del proceso que vas a postular. Te muestro los procesos
                equivalentes de años anteriores en la misma entidad (con IA para evaluar
                similitud).
              </p>
            </div>
          </div>

          {/* Tabs de modo */}
          <div className="mt-4 flex bg-gray-100 rounded-lg p-0.5 text-sm w-fit">
            <button
              onClick={() => setModo('descripcion')}
              disabled={loading}
              className={clsx(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-colors',
                modo === 'descripcion'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              )}
            >
              <FileText size={14} />
              Por descripción
            </button>
            <button
              onClick={() => setModo('nomenclatura')}
              disabled={loading}
              className={clsx(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-colors',
                modo === 'nomenclatura'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              )}
            >
              <Hash size={14} />
              Por nomenclatura
            </button>
          </div>

          {/* Input según modo */}
          {modo === 'nomenclatura' ? (
            <div className="flex gap-2 mt-3">
              <div className="flex-1 relative">
                <Hash
                  size={16}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                />
                <input
                  value={nomenclatura}
                  onChange={(e) => setNomenclatura(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') buscar();
                  }}
                  placeholder="CP-SM-36-2024-ELSE-1 (debe estar en BD_PROCESOS)"
                  className="w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  disabled={loading}
                />
              </div>
              <Button
                onClick={buscar}
                loading={loading}
                icon={<Search size={16} />}
                disabled={loading}
              >
                Buscar
              </Button>
            </div>
          ) : (
            <div className="mt-3 space-y-2">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Entidad (nombre o parte del nombre)
                </label>
                <div className="relative">
                  <Building2
                    size={16}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                  />
                  <input
                    value={entidadManual}
                    onChange={(e) => setEntidadManual(e.target.value)}
                    placeholder="ELECTRO SUR ESTE, o ENOSA, o el nombre completo"
                    className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    disabled={loading}
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Descripción del objeto (copiala tal cual del Excel SEACE)
                </label>
                <div className="relative">
                  <FileText
                    size={16}
                    className="absolute left-3 top-3 text-gray-400"
                  />
                  <textarea
                    value={descripcionManual}
                    onChange={(e) => setDescripcionManual(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) buscar();
                    }}
                    placeholder="INSPECCIONES DETALLADAS DE PÉRDIDAS"
                    rows={2}
                    className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                    disabled={loading}
                  />
                </div>
                <p className="text-[11px] text-gray-500 mt-1">
                  Tip: Ctrl+Enter para buscar
                </p>
              </div>
              <div className="flex justify-end">
                <Button
                  onClick={buscar}
                  loading={loading}
                  icon={<Search size={16} />}
                  disabled={loading}
                >
                  Buscar históricos
                </Button>
              </div>
            </div>
          )}

          {error && (
            <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
              <AlertCircle size={16} className="text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {stage === 'rerankeo' && (
            <div className="mt-3 p-3 bg-indigo-50 border border-indigo-200 rounded-lg flex items-center gap-2">
              <Loader2 size={16} className="text-indigo-600 animate-spin" />
              <p className="text-sm text-indigo-700">
                DeepSeek está evaluando la similitud semántica de los candidatos…
              </p>
            </div>
          )}
        </div>
      </Card>

      {/* Target info */}
      {target && (
        <Card>
          <div className="p-5">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-gray-100 rounded-lg flex-shrink-0">
                <Building2 size={18} className="text-gray-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Proceso actual (target)
                </p>
                <p className="text-sm font-mono font-semibold text-gray-900 mt-0.5">
                  {target.nomenclatura || <span className="italic text-gray-400">(manual)</span>}
                </p>
                <p className="text-sm text-gray-700 mt-1">{target.descripcion}</p>
                <p className="text-xs text-gray-500 mt-1">{target.entidad}</p>
                <div className="flex gap-1.5 mt-2 flex-wrap">
                  {target.empresaCorta && (
                    <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded bg-indigo-100 text-indigo-700">
                      {target.empresaCorta}
                    </span>
                  )}
                  {target.tipoServicio && (
                    <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded bg-purple-100 text-purple-700">
                      {target.tipoServicio}
                    </span>
                  )}
                  <span className="inline-flex items-center px-2 py-0.5 text-xs font-mono rounded bg-gray-100 text-gray-700">
                    año {target.año}
                  </span>
                </div>
                {keywordsBackend.length > 0 && (
                  <div className="mt-3">
                    <p className="text-xs text-gray-500 mb-1">Keywords usadas en el filtro:</p>
                    <div className="flex gap-1 flex-wrap">
                      {keywordsBackend.map((k) => (
                        <span
                          key={k}
                          className="inline-flex items-center px-1.5 py-0.5 text-[11px] font-mono rounded bg-yellow-50 text-yellow-800 border border-yellow-200"
                        >
                          {k}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Candidatos */}
      {candidatos.length > 0 && (
        <Card>
          <div className="p-5 border-b border-gray-100">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <h3 className="text-base font-semibold text-gray-900">
                  Candidatos ({candidatos.length})
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Marcá los que realmente son históricos del mismo servicio
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex bg-gray-100 rounded-lg p-0.5 text-xs">
                  {(['score', 'año', 'valor'] as OrdenBy[]).map((o) => (
                    <button
                      key={o}
                      onClick={() => setOrden(o)}
                      className={clsx(
                        'px-2.5 py-1 rounded-md font-medium transition-colors',
                        orden === o
                          ? 'bg-white text-gray-900 shadow-sm'
                          : 'text-gray-600 hover:text-gray-900'
                      )}
                    >
                      {o === 'score' ? 'Similitud' : o === 'año' ? 'Año' : 'Valor'}
                    </button>
                  ))}
                </div>
                <div className="flex gap-1 text-xs">
                  <button
                    onClick={() => selectAllWithScore(85)}
                    className="px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-medium"
                  >
                    + sim. alta
                  </button>
                  <button
                    onClick={() => selectAllWithScore(70)}
                    className="px-2.5 py-1 rounded-md bg-teal-50 text-teal-700 hover:bg-teal-100 font-medium"
                  >
                    + sim. buena
                  </button>
                  <button
                    onClick={() => setSelected(new Set())}
                    className="px-2.5 py-1 rounded-md bg-gray-100 text-gray-600 hover:bg-gray-200 font-medium"
                  >
                    Limpiar
                  </button>
                </div>
              </div>
            </div>

            {statsSeleccion && (
              <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg space-y-2">
                <div className="flex items-center gap-4 flex-wrap">
                  <div className="text-sm font-medium text-blue-900">
                    {statsSeleccion.count} seleccionado{statsSeleccion.count !== 1 ? 's' : ''}
                  </div>
                  {statsSeleccion.media > 0 && (
                    <>
                      <span className="text-xs text-blue-700">
                        Min: <strong>{formatSoles(statsSeleccion.min)}</strong>
                      </span>
                      <span className="text-xs text-blue-700">
                        Máx: <strong>{formatSoles(statsSeleccion.max)}</strong>
                      </span>
                      <span className="text-xs text-blue-700">
                        Media: <strong>{formatSoles(statsSeleccion.media)}</strong>
                      </span>
                    </>
                  )}
                </div>

                {/* Si el target no tiene nomenclatura (modo descripción manual),
                    pedir la nomenclatura actual para poder guardar el grupo */}
                {!target?.nomenclatura && (
                  <div className="flex gap-2 items-center">
                    <input
                      value={nomenclaturaParaGuardar}
                      onChange={(e) => setNomenclaturaParaGuardar(e.target.value)}
                      placeholder="Nomenclatura actual (ej: CP-SER-SM-34-2026-ELSE-1)"
                      className="flex-1 px-3 py-2 border border-blue-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <Button
                      size="sm"
                      onClick={guardarGrupo}
                      loading={guardando}
                      icon={<ArrowRight size={14} />}
                      disabled={!nomenclaturaParaGuardar.trim()}
                    >
                      Crear grupo
                    </Button>
                  </div>
                )}

                {target?.nomenclatura && (
                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      onClick={guardarGrupo}
                      loading={guardando}
                      icon={<ArrowRight size={14} />}
                    >
                      Crear grupo histórico
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="w-10 text-left py-2 px-3 font-medium text-gray-600 text-xs">✓</th>
                  <th className="text-left py-2 px-3 font-medium text-gray-600 text-xs w-16">
                    Año
                  </th>
                  <th className="text-left py-2 px-3 font-medium text-gray-600 text-xs">
                    Nomenclatura
                  </th>
                  <th className="text-left py-2 px-3 font-medium text-gray-600 text-xs">
                    Descripción
                  </th>
                  <th className="text-right py-2 px-3 font-medium text-gray-600 text-xs w-32">
                    Valor ref.
                  </th>
                  <th className="text-center py-2 px-3 font-medium text-gray-600 text-xs w-24">
                    Similitud
                  </th>
                </tr>
              </thead>
              <tbody>
                {candidatosOrdenados.map((c) => {
                  const score = c.llmScore ?? c.score;
                  const isSelected = selected.has(c.nomenclatura);
                  return (
                    <tr
                      key={c.nomenclatura}
                      className={clsx(
                        'border-b border-gray-100 transition-colors cursor-pointer',
                        isSelected ? 'bg-indigo-50' : 'hover:bg-gray-50'
                      )}
                      onClick={() => toggleSelect(c.nomenclatura)}
                    >
                      <td className="py-2.5 px-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(c.nomenclatura)}
                          onClick={(e) => e.stopPropagation()}
                          className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                        />
                      </td>
                      <td className="py-2.5 px-3 font-mono text-sm font-semibold text-gray-900">
                        {c.año}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-xs text-gray-700">
                        {c.nomenclatura}
                      </td>
                      <td className="py-2.5 px-3 text-gray-700 text-xs max-w-md">
                        <div className="truncate" title={c.descripcion}>
                          {c.descripcion}
                        </div>
                        {c.llmRazon && (
                          <div className="text-[11px] text-indigo-600 italic mt-0.5 truncate" title={c.llmRazon}>
                            💡 {c.llmRazon}
                          </div>
                        )}
                        {c.matchedKeywords.length > 0 && !c.llmRazon && (
                          <div className="flex gap-1 flex-wrap mt-0.5">
                            {c.matchedKeywords.slice(0, 4).map((k) => (
                              <span
                                key={k}
                                className="inline-flex items-center px-1 text-[10px] font-mono rounded bg-yellow-50 text-yellow-700"
                              >
                                {k}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-xs text-gray-700">
                        {formatSoles(c.valor)}
                      </td>
                      <td className="py-2.5 px-3">
                        <div
                          className={clsx(
                            'inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-medium',
                            scoreColor(score)
                          )}
                          title={c.llmRazon || `Score: ${score}`}
                        >
                          <span className="font-mono">{score}</span>
                          <span className="opacity-75">·</span>
                          <span>{scoreLabel(score)}</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {grupoCreadoId && (
        <Card>
          <div className="p-6 bg-gradient-to-br from-emerald-50 to-teal-50 border-l-4 border-emerald-500">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-emerald-100 rounded-full">
                <CheckCircle2 size={20} className="text-emerald-700" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-semibold text-emerald-900">
                  Grupo creado
                </h3>
                <p className="text-sm text-emerald-800 mt-1">
                  ID: <code className="font-mono bg-white/60 px-1 rounded">{grupoCreadoId}</code> ·{' '}
                  {selected.size} históricos vinculados
                </p>
                <p className="text-xs text-emerald-700 mt-2">
                  Próximo paso: abrí <strong>Mis Grupos</strong> para ver el análisis consolidado
                  y disparar el scraping detallado (cuando esté disponible la Fase 2).
                </p>
                <div className="flex gap-2 mt-3">
                  <Button
                    size="sm"
                    onClick={() => setVistaActiva('grupos' as any)}
                    icon={<ArrowRight size={14} />}
                  >
                    Ver en Mis Grupos
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setGrupoCreadoId(null);
                      setSelected(new Set());
                      setCandidatos([]);
                      setTarget(null);
                      setNomenclatura('');
                      setDescripcionManual('');
                      setEntidadManual('');
                    }}
                  >
                    Buscar otro
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </Card>
      )}

      {stage === 'done' && candidatos.length === 0 && target && (
        <Card>
          <div className="p-8 text-center">
            <AlertCircle size={32} className="text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-600">
              No se encontraron históricos para <strong>{target.nomenclatura}</strong>.
            </p>
            <p className="text-xs text-gray-500 mt-1">
              Puede que la entidad no tenga histórico del mismo servicio en años anteriores, o
              que la clasificación automática no esté asignándole la misma EMPRESA_CORTA.
            </p>
          </div>
        </Card>
      )}
    </div>
  );
}
