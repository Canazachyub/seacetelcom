import { useMemo, useState, useCallback } from 'react';
import { useStore } from '../../store/useStore';
import { Badge } from '../ui/Badge';
import { formatearMoneda, formatearFecha } from '../../utils/constants';
import {
  buscarHistoricos,
  calcularTendencia,
  agruparPorAño,
  type ProcesoHistorico,
  type TendenciaHistorica
} from '../../utils/historicos';
import { crearGrupoHistorico, addSeguimientoCompleto } from '../../services/api';
import { SeaceDataViewer } from './SeaceDataViewer';
import type { Proceso } from '../../types';
import {
  History,
  TrendingUp,
  TrendingDown,
  Minus,
  Calendar,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  CheckCircle2,
  Clock,
  Square,
  CheckSquare,
  FolderPlus,
  Loader2,
  Database,
  X
} from 'lucide-react';

interface Props {
  proceso: Proceso;
}

export function ProcesoHistoricos({ proceso }: Props) {
  const { procesos } = useStore();
  const [expandido, setExpandido] = useState(false);
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set());
  const [creandoGrupo, setCreandoGrupo] = useState(false);
  const [ocdsModal, setOcdsModal] = useState<{ nomenclatura: string; proceso: Proceso } | null>(null);

  // Buscar históricos
  const historicos = useMemo(() => {
    return buscarHistoricos(proceso, procesos || [], 0.25);
  }, [proceso, procesos]);

  // Calcular tendencia
  const tendencia = useMemo(() => {
    return calcularTendencia(proceso, historicos);
  }, [proceso, historicos]);

  // Agrupar por año
  const porAño = useMemo(() => {
    return agruparPorAño(historicos);
  }, [historicos]);

  // Toggle selección de un histórico
  const toggleSeleccion = useCallback((nomenclatura: string) => {
    setSeleccionados(prev => {
      const nuevo = new Set(prev);
      if (nuevo.has(nomenclatura)) {
        nuevo.delete(nomenclatura);
      } else {
        nuevo.add(nomenclatura);
      }
      return nuevo;
    });
  }, []);

  // Seleccionar/deseleccionar todos
  const toggleTodos = useCallback(() => {
    if (seleccionados.size === historicos.length) {
      setSeleccionados(new Set());
    } else {
      setSeleccionados(new Set(historicos.map(h => h.proceso.NOMENCLATURA)));
    }
  }, [historicos, seleccionados.size]);

  // Crear grupo y agregar a seguimiento
  const crearGrupoYSeguimiento = useCallback(async () => {
    if (seleccionados.size === 0) return;

    setCreandoGrupo(true);
    try {
      // Primero agregar a seguimiento si no está
      await addSeguimientoCompleto(
        proceso.NOMENCLATURA,
        'PENDIENTE',
        'MEDIA',
        `Grupo con ${seleccionados.size} histórico(s)`,
        true
      );

      // Luego crear el grupo de históricos
      const resultado = await crearGrupoHistorico(
        proceso.NOMENCLATURA,
        Array.from(seleccionados),
        proceso.ENTIDAD,
        `Grupo creado con ${seleccionados.size} proceso(s) histórico(s)`
      );

      if (resultado.success) {
        console.log(`Grupo creado con ${seleccionados.size} histórico(s). Carpeta: ${resultado.carpetaUrl ? 'creada' : 'pendiente'}`);
        setSeleccionados(new Set());
      } else {
        console.error(resultado.error || 'Error al crear grupo');
      }
    } catch (error) {
      console.error('Error al crear grupo de históricos', error);
    } finally {
      setCreandoGrupo(false);
    }
  }, [proceso, seleccionados]);

  if (historicos.length === 0) {
    return (
      <div className="mt-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
        <div className="flex items-center gap-2 text-gray-500">
          <History size={16} />
          <span className="text-sm">Sin históricos encontrados para este proceso</span>
        </div>
      </div>
    );
  }

  const años = Object.keys(porAño).map(Number).sort((a, b) => b - a);
  const todosSeleccionados = seleccionados.size === historicos.length;

  return (
    <div className="mt-4 border border-blue-200 rounded-lg overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpandido(!expandido)}
        className="w-full px-4 py-3 bg-blue-50 flex items-center justify-between hover:bg-blue-100 transition-colors"
      >
        <div className="flex items-center gap-3">
          <History size={18} className="text-blue-600" />
          <span className="font-medium text-blue-900">
            Históricos Encontrados
          </span>
          <Badge variant="info" size="sm">
            {historicos.length} proceso{historicos.length !== 1 ? 's' : ''}
          </Badge>
          {seleccionados.size > 0 && (
            <Badge variant="warning" size="sm">
              {seleccionados.size} seleccionado{seleccionados.size !== 1 ? 's' : ''}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-4">
          {tendencia && <TendenciaIndicador tendencia={tendencia} valorActual={proceso.VALOR} />}
          {expandido ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
        </div>
      </button>

      {/* Contenido expandido */}
      {expandido && (
        <div className="p-4 bg-white">
          {/* Barra de acciones */}
          <div className="mb-4 flex items-center justify-between gap-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
            <button
              onClick={toggleTodos}
              className="flex items-center gap-2 text-sm text-gray-700 hover:text-blue-600 transition-colors"
            >
              {todosSeleccionados ? (
                <CheckSquare size={18} className="text-blue-600" />
              ) : (
                <Square size={18} />
              )}
              {todosSeleccionados ? 'Deseleccionar todos' : 'Seleccionar todos'}
            </button>

            <button
              onClick={crearGrupoYSeguimiento}
              disabled={seleccionados.size === 0 || creandoGrupo}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                seleccionados.size > 0
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'bg-gray-200 text-gray-400 cursor-not-allowed'
              }`}
            >
              {creandoGrupo ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <FolderPlus size={16} />
              )}
              {creandoGrupo ? 'Creando...' : `Crear Grupo y Seguimiento (${seleccionados.size})`}
            </button>
          </div>

          {/* Resumen de tendencia */}
          {tendencia && (
            <div className="mb-4 grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="text-xs text-gray-500 mb-1">Valor Promedio Histórico</p>
                <p className="font-semibold text-gray-900">
                  {formatearMoneda(tendencia.valorPromedio)}
                </p>
              </div>
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="text-xs text-gray-500 mb-1">Rango de Valores</p>
                <p className="font-semibold text-gray-900 text-sm">
                  {formatearMoneda(tendencia.valorMinimo)} - {formatearMoneda(tendencia.valorMaximo)}
                </p>
              </div>
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="text-xs text-gray-500 mb-1">Frecuencia</p>
                <p className="font-semibold text-gray-900">
                  {tendencia.frecuenciaAnual.toFixed(1)} vez/año
                </p>
              </div>
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="text-xs text-gray-500 mb-1">Último Histórico</p>
                <p className="font-semibold text-gray-900">
                  {formatearFecha(tendencia.ultimaFecha)}
                </p>
              </div>
            </div>
          )}

          {/* Lista por año */}
          <div className="space-y-3">
            {años.map(año => (
              <AñoHistoricos
                key={año}
                año={año}
                historicos={porAño[año]}
                seleccionados={seleccionados}
                onToggle={toggleSeleccion}
                onVerOcds={(nom, proc) => setOcdsModal({ nomenclatura: nom, proceso: proc })}
              />
            ))}
          </div>
        </div>
      )}

      {/* Modal OCDS */}
      {ocdsModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50">
              <h3 className="font-semibold text-gray-900">Datos OCDS - {ocdsModal.nomenclatura}</h3>
              <button
                onClick={() => setOcdsModal(null)}
                className="p-1 hover:bg-gray-200 rounded-lg transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4">
              <SeaceDataViewer nomenclatura={ocdsModal.nomenclatura} proceso={ocdsModal.proceso} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TendenciaIndicador({
  tendencia,
  valorActual
}: {
  tendencia: TendenciaHistorica;
  valorActual: number;
}) {
  const diferencia = ((valorActual - tendencia.valorPromedio) / tendencia.valorPromedio) * 100;
  const absDir = Math.abs(diferencia);

  return (
    <div className="flex items-center gap-2 text-sm">
      {tendencia.tendenciaValor === 'subiendo' && (
        <>
          <TrendingUp size={16} className="text-red-500" />
          <span className="text-red-600">+{absDir.toFixed(0)}% vs promedio</span>
        </>
      )}
      {tendencia.tendenciaValor === 'bajando' && (
        <>
          <TrendingDown size={16} className="text-green-500" />
          <span className="text-green-600">-{absDir.toFixed(0)}% vs promedio</span>
        </>
      )}
      {tendencia.tendenciaValor === 'estable' && (
        <>
          <Minus size={16} className="text-gray-500" />
          <span className="text-gray-600">Similar al promedio</span>
        </>
      )}
    </div>
  );
}

function AñoHistoricos({
  año,
  historicos,
  seleccionados,
  onToggle,
  onVerOcds
}: {
  año: number;
  historicos: ProcesoHistorico[];
  seleccionados: Set<string>;
  onToggle: (nomenclatura: string) => void;
  onVerOcds: (nomenclatura: string, proceso: Proceso) => void;
}) {
  const [expandido, setExpandido] = useState(false);
  const seleccionadosEnAño = historicos.filter(h => seleccionados.has(h.proceso.NOMENCLATURA)).length;

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpandido(!expandido)}
        className="w-full px-3 py-2 bg-gray-50 flex items-center justify-between hover:bg-gray-100 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Calendar size={14} className="text-gray-500" />
          <span className="font-medium text-gray-700">{año}</span>
          <span className="text-xs text-gray-500">
            ({historicos.length} proceso{historicos.length !== 1 ? 's' : ''})
          </span>
          {seleccionadosEnAño > 0 && (
            <Badge variant="warning" size="sm">
              {seleccionadosEnAño} sel.
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600">
            {formatearMoneda(
              historicos.reduce((sum, h) => sum + (h.proceso.VALOR || 0), 0) / historicos.length
            )} prom.
          </span>
          {expandido ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </div>
      </button>

      {expandido && (
        <div className="divide-y divide-gray-100">
          {historicos.map(h => (
            <HistoricoItem
              key={h.proceso.ID}
              historico={h}
              seleccionado={seleccionados.has(h.proceso.NOMENCLATURA)}
              onToggle={() => onToggle(h.proceso.NOMENCLATURA)}
              onVerOcds={() => onVerOcds(h.proceso.NOMENCLATURA, h.proceso)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function HistoricoItem({
  historico,
  seleccionado,
  onToggle,
  onVerOcds
}: {
  historico: ProcesoHistorico;
  seleccionado: boolean;
  onToggle: () => void;
  onVerOcds: () => void;
}) {
  const { proceso, similitud, coincidencias, esReincidencia } = historico;

  return (
    <div
      className={`px-3 py-2 hover:bg-gray-50 cursor-pointer transition-colors ${
        seleccionado ? 'bg-blue-50 border-l-4 border-blue-500' : ''
      }`}
      onClick={onToggle}
    >
      <div className="flex items-start gap-3">
        {/* Checkbox */}
        <div className="pt-0.5">
          {seleccionado ? (
            <CheckSquare size={18} className="text-blue-600" />
          ) : (
            <Square size={18} className="text-gray-400" />
          )}
        </div>

        {/* Contenido */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-medium text-gray-900">
              {proceso.NOMENCLATURA}
            </span>
            {esReincidencia ? (
              <Badge variant="success" size="sm" className="flex items-center gap-1">
                <CheckCircle2 size={10} />
                Reincidencia
              </Badge>
            ) : (
              <Badge variant="default" size="sm" className="flex items-center gap-1">
                <AlertCircle size={10} />
                Similar ({Math.round(similitud * 100)}%)
              </Badge>
            )}
          </div>
          <p className="text-xs text-gray-600 line-clamp-2 mb-1">
            {proceso.DESCRIPCION}
          </p>
          {coincidencias.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {coincidencias.slice(0, 5).map(palabra => (
                <span
                  key={palabra}
                  className="px-1.5 py-0.5 text-[10px] bg-yellow-100 text-yellow-800 rounded"
                >
                  {palabra}
                </span>
              ))}
              {coincidencias.length > 5 && (
                <span className="text-[10px] text-gray-400">
                  +{coincidencias.length - 5} más
                </span>
              )}
            </div>
          )}
        </div>

        {/* Valor y fecha */}
        <div className="text-right flex-shrink-0">
          <p className="text-sm font-semibold text-gray-900">
            {formatearMoneda(proceso.VALOR, proceso.MONEDA)}
          </p>
          <p className="text-xs text-gray-500 flex items-center justify-end gap-1">
            <Clock size={10} />
            {formatearFecha(proceso.FECHA_PUB)}
          </p>
        </div>

        {/* Botón OCDS */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onVerOcds();
          }}
          className="flex items-center gap-1 px-2 py-1.5 bg-purple-100 text-purple-700 hover:bg-purple-200 rounded-lg transition-colors flex-shrink-0"
          title="Ver datos OCDS de este proceso"
        >
          <Database size={14} />
          <span className="text-xs font-medium">OCDS</span>
        </button>
      </div>
    </div>
  );
}

// Exportar también un componente compacto para mostrar en la lista
export function HistoricosIndicador({ proceso }: Props) {
  const { procesos } = useStore();

  const cantidadHistoricos = useMemo(() => {
    const historicos = buscarHistoricos(proceso, procesos || [], 0.25);
    return historicos.length;
  }, [proceso, procesos]);

  if (cantidadHistoricos === 0) return null;

  return (
    <div
      className="flex items-center gap-1 text-blue-600"
      title={`${cantidadHistoricos} proceso(s) histórico(s) similar(es)`}
    >
      <History size={14} />
      <span className="text-xs font-medium">{cantidadHistoricos}</span>
    </div>
  );
}
