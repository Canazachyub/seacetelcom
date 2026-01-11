import { useEffect, useState } from 'react';
import { useStore } from './store/useStore';
import { Layout } from './components/layout/Layout';
import { Dashboard } from './components/dashboard/Dashboard';
import { ProcesosTable } from './components/table/ProcesosTable';
import { FilterPanel } from './components/filters/FilterPanel';
import { PeruMap } from './components/map/PeruMap';
import { AIChat } from './components/ai/AIChat';
import { OCDSTester } from './components/ocds/OCDSTester';
import { SeguimientoDetalleCompleto } from './components/seguimiento/SeguimientoDetalleCompleto';
import { Card, CardHeader } from './components/ui/Card';
import { Button } from './components/ui/Button';
import { Input } from './components/ui/Input';
import { EstadoBadge, PrioridadBadge } from './components/ui/Badge';
import { Settings, Save, ExternalLink, Star, Search, X, MapPin, TrendingUp, Calendar, Building2, FileText, Database, Edit2, Check, XCircle } from 'lucide-react';
import type { Proceso } from './types';

function App() {
  const { vistaActiva, cargarTodo, apiUrl, setApiUrl } = useStore();
  const [configUrl, setConfigUrl] = useState(apiUrl);

  useEffect(() => {
    cargarTodo();
  }, []);

  const guardarConfig = () => {
    setApiUrl(configUrl);
    window.location.reload();
  };

  const renderVista = () => {
    switch (vistaActiva) {
      case 'dashboard':
        return <Dashboard />;
      case 'procesos':
        return (
          <div className="space-y-4">
            <FilterPanel />
            <ProcesosTable />
          </div>
        );
      case 'seguimiento':
        return <SeguimientoView />;
      case 'mapa':
        return <MapaView />;
      case 'ocds':
        return <OCDSTester />;
      default:
        return <ConfiguracionView configUrl={configUrl} setConfigUrl={setConfigUrl} guardarConfig={guardarConfig} />;
    }
  };

  return (
    <Layout>
      {renderVista()}
      <AIChat />
    </Layout>
  );
}

function SeguimientoView() {
  const { seguimiento, procesos, cargarSeguimiento, actualizarSeguimiento } = useStore();
  const [selectedProceso, setSelectedProceso] = useState<string | null>(null);

  // Estados para edición
  const [editando, setEditando] = useState<string | null>(null);
  const [datosEdicion, setDatosEdicion] = useState<{
    estado: string;
    prioridad: string;
    notas: string;
  } | null>(null);

  // Cargar archivos cuando se expande un proceso
  const handleToggleProceso = (nomenclatura: string) => {
    if (selectedProceso === nomenclatura) {
      setSelectedProceso(null);
    } else {
      setSelectedProceso(nomenclatura);
    }
  };

  // Funciones para edición
  const iniciarEdicion = (s: typeof seguimiento[0]) => {
    setEditando(s.NOMENCLATURA);
    setDatosEdicion({
      estado: s.ESTADO_INTERES || 'PENDIENTE',
      prioridad: s.PRIORIDAD || 'MEDIA',
      notas: s.NOTAS || ''
    });
  };

  const cancelarEdicion = () => {
    setEditando(null);
    setDatosEdicion(null);
  };

  const guardarEdicion = async (nomenclatura: string) => {
    if (!datosEdicion) return;

    try {
      await actualizarSeguimiento(
        nomenclatura,
        datosEdicion.estado,
        datosEdicion.prioridad,
        datosEdicion.notas
      );
      setEditando(null);
      setDatosEdicion(null);
    } catch (error) {
      alert('❌ Error al guardar los cambios');
    }
  };

  const ETAPAS = [
    { key: 'CONVOCATORIA', nombre: 'Convocatoria', icono: '1' },
    { key: 'REGISTRO_PARTICIPANTES', nombre: 'Registro', icono: '2' },
    { key: 'CONSULTAS_OBSERVACIONES', nombre: 'Consultas', icono: '3' },
    { key: 'ABSOLUCION_CONSULTAS', nombre: 'Absolución', icono: '4' },
    { key: 'INTEGRACION_BASES', nombre: 'Bases', icono: '5' },
    { key: 'PRESENTACION_PROPUESTAS', nombre: 'Propuestas', icono: '6' },
    { key: 'CALIFICACION_EVALUACION', nombre: 'Evaluación', icono: '7' },
    { key: 'BUENA_PRO', nombre: 'Buena Pro', icono: '8' },
  ];

  const getEstadoColor = (estado: string | undefined) => {
    switch (estado) {
      case 'COMPLETADO': return 'bg-emerald-500 border-emerald-500 text-white';
      case 'EN_CURSO': return 'bg-blue-500 border-blue-500 text-white';
      case 'VENCIDO': return 'bg-red-500 border-red-500 text-white';
      case 'NO_APLICA': return 'bg-slate-300 border-slate-300 text-slate-600';
      default: return 'bg-gray-100 border-gray-300 text-gray-400';
    }
  };

  const getLineColor = (estado: string | undefined) => {
    switch (estado) {
      case 'COMPLETADO': return 'bg-emerald-500';
      case 'EN_CURSO': return 'bg-blue-500';
      case 'VENCIDO': return 'bg-red-500';
      default: return 'bg-gray-200';
    }
  };

  const formatearMonedaLocal = (valor: number | undefined) => {
    if (!valor) return 'S/ 0';
    return new Intl.NumberFormat('es-PE', {
      style: 'currency',
      currency: 'PEN',
      minimumFractionDigits: 0
    }).format(valor);
  };

  // Calcular progreso de un proceso
  const calcularProgreso = (s: typeof seguimiento[0]) => {
    let completados = 0;
    ETAPAS.forEach(e => {
      const etapaData = s[e.key as keyof typeof s] as { ESTADO?: string } | undefined;
      if (etapaData?.ESTADO === 'COMPLETADO') completados++;
    });
    return Math.round((completados / ETAPAS.length) * 100);
  };

  return (
    <div className="space-y-6">
      {/* Banner OCDS */}
      <div className="bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-purple-100 rounded-lg">
            <Database size={24} className="text-purple-600" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-gray-900 mb-1">
              🎉 Integración OCDS Automática Activada
            </h3>
            <p className="text-sm text-gray-700 mb-2">
              Cuando agregas un proceso a seguimiento, ahora se obtienen automáticamente las fechas reales del cronograma desde la API OCDS del gobierno.
            </p>
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="px-2 py-1 bg-white rounded border border-purple-200 text-purple-700">
                ✅ Cronograma automático con fechas reales
              </span>
              <span className="px-2 py-1 bg-white rounded border border-purple-200 text-purple-700">
                📁 Carpeta Drive creada automáticamente
              </span>
              <span className="px-2 py-1 bg-white rounded border border-purple-200 text-purple-700">
                🔄 Actualizar desde OCDS en cualquier momento
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <div className="text-center">
            <p className="text-3xl font-bold text-gray-900">{seguimiento.length}</p>
            <p className="text-sm text-gray-500">Total en seguimiento</p>
          </div>
        </Card>
        <Card>
          <div className="text-center">
            <p className="text-3xl font-bold text-green-600">
              {seguimiento.filter(s => s.ESTADO_INTERES === 'INSCRITO').length}
            </p>
            <p className="text-sm text-gray-500">Inscritos</p>
          </div>
        </Card>
        <Card>
          <div className="text-center">
            <p className="text-3xl font-bold text-amber-600">
              {seguimiento.filter(s => s.PRIORIDAD === 'ALTA').length}
            </p>
            <p className="text-sm text-gray-500">Prioridad Alta</p>
          </div>
        </Card>
        <Card>
          <div className="text-center">
            <p className="text-3xl font-bold text-blue-600">
              {seguimiento.filter(s => {
                const etapa = s.PRESENTACION_PROPUESTAS as { ESTADO?: string } | undefined;
                return etapa?.ESTADO === 'EN_CURSO' || etapa?.ESTADO === 'PENDIENTE';
              }).length}
            </p>
            <p className="text-sm text-gray-500">Por Presentar</p>
          </div>
        </Card>
      </div>

      {/* Lista de seguimiento */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <CardHeader title="Procesos en Seguimiento" icon={<Star size={20} />} />
          <Button variant="outline" size="sm" onClick={() => cargarSeguimiento()}>
            Actualizar
          </Button>
        </div>

        {seguimiento.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <Star size={48} className="mx-auto mb-3 text-gray-300" />
            <p className="font-medium">No tienes procesos en seguimiento</p>
            <p className="text-sm mt-1">Ve a la vista de Procesos y agrega algunos</p>
          </div>
        ) : (
          <div className="space-y-4">
            {seguimiento.map(s => {
              const proceso = procesos.find(p => p.NOMENCLATURA === s.NOMENCLATURA);
              const isExpanded = selectedProceso === s.NOMENCLATURA;
              const progreso = calcularProgreso(s);

              return (
                <div
                  key={s.NOMENCLATURA}
                  className={`border rounded-xl overflow-hidden transition-all ${
                    isExpanded ? 'border-violet-300 shadow-lg' : 'border-gray-200 hover:border-violet-200'
                  }`}
                >
                  {/* Header del proceso */}
                  <div
                    className="p-4 bg-gradient-to-r from-gray-50 to-white cursor-pointer"
                    onClick={() => handleToggleProceso(s.NOMENCLATURA)}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-gray-900">{s.NOMENCLATURA}</p>
                          {s.CARPETA_DRIVE && (
                            <a
                              href={s.CARPETA_DRIVE}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                              title="Abrir carpeta en Drive"
                            >
                              <ExternalLink size={14} />
                            </a>
                          )}
                        </div>
                        {proceso && (
                          <p className="text-sm text-gray-600 mt-1 truncate">
                            {proceso.ENTIDAD}
                          </p>
                        )}
                        {proceso && (
                          <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">
                            {proceso.DESCRIPCION}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <div className="text-right">
                          <p className="text-sm font-semibold text-emerald-600">
                            {formatearMonedaLocal(proceso?.VALOR)}
                          </p>
                          <p className="text-xs text-gray-500">{proceso?.OBJETO}</p>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          {editando === s.NOMENCLATURA && datosEdicion ? (
                            <>
                              <select
                                value={datosEdicion.estado}
                                onChange={(e) => {
                                  e.stopPropagation();
                                  setDatosEdicion({ ...datosEdicion, estado: e.target.value });
                                }}
                                onClick={(e) => e.stopPropagation()}
                                className="text-xs px-2 py-1 border border-gray-300 rounded"
                              >
                                <option value="PENDIENTE">Pendiente</option>
                                <option value="EN_REVISION">En Revisión</option>
                                <option value="PREPARANDO">Preparando</option>
                                <option value="INSCRITO">Inscrito</option>
                                <option value="PRESENTADO">Presentado</option>
                                <option value="GANADO">Ganado</option>
                                <option value="PERDIDO">Perdido</option>
                                <option value="DESCARTADO">Descartado</option>
                              </select>
                              <select
                                value={datosEdicion.prioridad}
                                onChange={(e) => {
                                  e.stopPropagation();
                                  setDatosEdicion({ ...datosEdicion, prioridad: e.target.value });
                                }}
                                onClick={(e) => e.stopPropagation()}
                                className="text-xs px-2 py-1 border border-gray-300 rounded"
                              >
                                <option value="ALTA">Alta</option>
                                <option value="MEDIA">Media</option>
                                <option value="BAJA">Baja</option>
                              </select>
                            </>
                          ) : (
                            <>
                              <EstadoBadge estado={s.ESTADO_INTERES} />
                              <PrioridadBadge prioridad={s.PRIORIDAD} />
                            </>
                          )}
                        </div>
                        {editando === s.NOMENCLATURA ? (
                          <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => guardarEdicion(s.NOMENCLATURA)}
                              className="p-1.5 bg-green-600 text-white rounded hover:bg-green-700 transition-colors"
                              title="Guardar cambios"
                            >
                              <Check size={16} />
                            </button>
                            <button
                              onClick={cancelarEdicion}
                              className="p-1.5 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
                              title="Cancelar"
                            >
                              <XCircle size={16} />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              iniciarEdicion(s);
                            }}
                            className="p-1.5 text-gray-600 hover:bg-gray-100 rounded transition-colors"
                            title="Editar"
                          >
                            <Edit2 size={16} />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Barra de progreso */}
                    <div className="mt-3">
                      <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                        <span>Progreso</span>
                        <span>{progreso}%</span>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-violet-500 to-purple-500 rounded-full transition-all"
                          style={{ width: `${progreso}%` }}
                        />
                      </div>
                    </div>

                    {/* Mini timeline */}
                    <div className="mt-3 flex items-center gap-1">
                      {ETAPAS.map((etapa, idx) => {
                        const etapaData = s[etapa.key as keyof typeof s] as { ESTADO?: string } | undefined;
                        const estado = etapaData?.ESTADO;
                        return (
                          <div key={etapa.key} className="flex items-center flex-1">
                            <div
                              className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${getEstadoColor(estado)}`}
                              title={`${etapa.nombre}: ${estado || 'PENDIENTE'}`}
                            >
                              {etapa.icono}
                            </div>
                            {idx < ETAPAS.length - 1 && (
                              <div className={`flex-1 h-1 ${getLineColor(estado)}`} />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Panel expandido con detalle completo mejorado */}
                  {isExpanded && (
                    <div className="border-t border-gray-200">
                      <SeguimientoDetalleCompleto nomenclatura={s.NOMENCLATURA} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Leyenda */}
      <Card>
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <span className="text-gray-500 font-medium">Leyenda:</span>
          <div className="flex items-center gap-1">
            <div className="w-4 h-4 rounded-full bg-gray-100 border border-gray-300" />
            <span className="text-gray-600">Pendiente</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-4 h-4 rounded-full bg-blue-500" />
            <span className="text-gray-600">En Curso</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-4 h-4 rounded-full bg-emerald-500" />
            <span className="text-gray-600">Completado</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-4 h-4 rounded-full bg-red-500" />
            <span className="text-gray-600">Vencido</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-4 h-4 rounded-full bg-slate-300" />
            <span className="text-gray-600">No Aplica</span>
          </div>
        </div>
      </Card>
    </div>
  );
}

function MapaView() {
  const { filtros, procesosFiltrados, setVistaActiva, setFiltros, limpiarFiltros, agregarSeguimiento, seguimiento } = useStore();
  const [procesoDetalle, setProcesoDetalle] = useState<Proceso | null>(null);
  const [busquedaLocal, setBusquedaLocal] = useState('');
  const [objetoFiltro, setObjetoFiltro] = useState<string>('');

  // Filtrar procesos localmente además de los filtros del store
  const procesosVisibles = procesosFiltrados.filter(p => {
    const matchBusqueda = !busquedaLocal ||
      p.DESCRIPCION?.toLowerCase().includes(busquedaLocal.toLowerCase()) ||
      p.ENTIDAD?.toLowerCase().includes(busquedaLocal.toLowerCase()) ||
      p.NOMENCLATURA?.toLowerCase().includes(busquedaLocal.toLowerCase());
    const matchObjeto = !objetoFiltro || p.OBJETO === objetoFiltro;
    return matchBusqueda && matchObjeto;
  });

  // Estadísticas de la región seleccionada
  const statsRegion = filtros.regiones.length > 0 ? {
    total: procesosVisibles.length,
    valor: procesosVisibles.reduce((acc, p) => acc + (p.VALOR || 0), 0),
    porObjeto: procesosVisibles.reduce((acc, p) => {
      acc[p.OBJETO] = (acc[p.OBJETO] || 0) + 1;
      return acc;
    }, {} as Record<string, number>)
  } : null;

  const tiposObjeto = ['Servicio', 'Bien', 'Obra', 'Consultoría de Obra'];

  const formatearMonedaLocal = (valor: number, moneda: string = 'PEN') => {
    return new Intl.NumberFormat('es-PE', {
      style: 'currency',
      currency: moneda === 'USD' ? 'USD' : 'PEN',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(valor);
  };

  const formatearFecha = (fecha: string | Date) => {
    return new Date(fecha).toLocaleDateString('es-PE', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  };

  const getObjetoBadgeColor = (objeto: string) => {
    switch(objeto) {
      case 'Servicio': return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'Bien': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
      case 'Obra': return 'bg-amber-100 text-amber-700 border-amber-200';
      case 'Consultoría de Obra': return 'bg-purple-100 text-purple-700 border-purple-200';
      default: return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  const estaEnSeguimiento = (nomenclatura: string) => {
    return seguimiento.some(s => s.NOMENCLATURA === nomenclatura);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
      {/* Mapa - 3 columnas */}
      <div className="lg:col-span-3">
        <Card>
          <CardHeader title="Mapa del Perú" subtitle="Click en una región para filtrar procesos" />
          <PeruMap className="h-[550px]" />
        </Card>
      </div>

      {/* Panel lateral - 2 columnas */}
      <div className="lg:col-span-2 space-y-4">
        {/* Filtros rápidos */}
        <Card>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                <Search size={16} />
                Filtros
              </h3>
              {(filtros.regiones.length > 0 || busquedaLocal || objetoFiltro) && (
                <button
                  onClick={() => { limpiarFiltros(); setBusquedaLocal(''); setObjetoFiltro(''); }}
                  className="text-xs text-red-600 hover:text-red-700 font-medium flex items-center gap-1"
                >
                  <X size={12} />
                  Limpiar
                </button>
              )}
            </div>

            {/* Búsqueda */}
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar en procesos..."
                value={busquedaLocal}
                onChange={(e) => setBusquedaLocal(e.target.value)}
                className="w-full pl-9 pr-8 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-transparent"
              />
              {busquedaLocal && (
                <button
                  onClick={() => setBusquedaLocal('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Filtro por tipo de objeto */}
            <div className="flex flex-wrap gap-2">
              {tiposObjeto.map(tipo => (
                <button
                  key={tipo}
                  onClick={() => setObjetoFiltro(objetoFiltro === tipo ? '' : tipo)}
                  className={`px-3 py-1 text-xs font-medium rounded-full border transition-all ${
                    objetoFiltro === tipo
                      ? 'bg-violet-600 text-white border-violet-600 shadow-sm'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-violet-300 hover:text-violet-600'
                  }`}
                >
                  {tipo}
                </button>
              ))}
            </div>

            {/* Regiones seleccionadas */}
            {filtros.regiones.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-2 border-t border-gray-100">
                <span className="text-xs text-gray-500 mr-1">Regiones:</span>
                {filtros.regiones.map(region => (
                  <span key={region} className="inline-flex items-center gap-1 px-2 py-0.5 bg-violet-100 text-violet-700 text-xs rounded-full">
                    <MapPin size={10} />
                    {region}
                    <button
                      onClick={() => setFiltros({ regiones: filtros.regiones.filter(r => r !== region) })}
                      className="hover:text-violet-900 ml-0.5"
                    >
                      <X size={10} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </Card>

        {/* Estadísticas de la región */}
        {statsRegion && (
          <Card>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-gradient-to-br from-violet-50 to-purple-50 rounded-xl border border-violet-100">
                <div className="flex items-center gap-2 text-violet-600 mb-1">
                  <FileText size={14} />
                  <span className="text-xs font-medium">Procesos</span>
                </div>
                <p className="text-2xl font-bold text-violet-700">{statsRegion.total}</p>
              </div>
              <div className="p-3 bg-gradient-to-br from-emerald-50 to-green-50 rounded-xl border border-emerald-100">
                <div className="flex items-center gap-2 text-emerald-600 mb-1">
                  <TrendingUp size={14} />
                  <span className="text-xs font-medium">Valor Total</span>
                </div>
                <p className="text-lg font-bold text-emerald-700">{formatearMonedaLocal(statsRegion.valor)}</p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {Object.entries(statsRegion.porObjeto).map(([obj, count]) => (
                <span key={obj} className={`px-2 py-1 text-xs rounded-full border ${getObjetoBadgeColor(obj)}`}>
                  {obj}: {count}
                </span>
              ))}
            </div>
          </Card>
        )}

        {/* Lista de procesos */}
        <Card>
          <CardHeader
            title="Procesos"
            subtitle={filtros.regiones.length > 0
              ? `${procesosVisibles.length} resultados`
              : 'Selecciona una región'}
          />
          {filtros.regiones.length > 0 ? (
            <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
              {procesosVisibles.slice(0, 30).map(p => (
                <div
                  key={p.ID}
                  onClick={() => setProcesoDetalle(p)}
                  className="p-3 bg-gray-50 rounded-lg border border-gray-200 hover:bg-white hover:border-violet-300 hover:shadow-md cursor-pointer transition-all group"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-sm text-gray-900 truncate group-hover:text-violet-700">{p.NOMENCLATURA}</p>
                        {estaEnSeguimiento(p.NOMENCLATURA) && (
                          <Star size={12} className="text-amber-500 fill-amber-500 flex-shrink-0" />
                        )}
                      </div>
                      <p className="text-xs text-gray-600 mt-0.5 truncate">{p.ENTIDAD}</p>
                    </div>
                    <span className={`px-2 py-0.5 text-xs rounded-full border flex-shrink-0 ${getObjetoBadgeColor(p.OBJETO)}`}>
                      {p.OBJETO}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-2 line-clamp-2">{p.DESCRIPCION}</p>
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100">
                    <span className="text-xs font-semibold text-emerald-600">{formatearMonedaLocal(p.VALOR, p.MONEDA)}</span>
                    <span className="text-xs text-gray-400 flex items-center gap-1">
                      <Calendar size={10} />
                      {formatearFecha(p.FECHA_PUB)}
                    </span>
                  </div>
                </div>
              ))}
              {procesosVisibles.length > 30 && (
                <div className="text-center py-3">
                  <button
                    onClick={() => setVistaActiva('procesos')}
                    className="text-sm text-violet-600 hover:text-violet-700 font-medium"
                  >
                    Ver {procesosVisibles.length - 30} procesos más →
                  </button>
                </div>
              )}
              {procesosVisibles.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  <Search size={24} className="mx-auto mb-2 text-gray-300" />
                  <p className="text-sm">No hay procesos que coincidan</p>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-12 text-gray-400">
              <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-gray-100 flex items-center justify-center">
                <MapPin size={28} className="text-gray-300" />
              </div>
              <p className="text-sm font-medium">Haz click en una región</p>
              <p className="text-xs mt-1">para ver sus procesos</p>
            </div>
          )}
        </Card>
      </div>

      {/* Modal de detalle del proceso */}
      {procesoDetalle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => setProcesoDetalle(null)}>
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="bg-gradient-to-r from-violet-600 to-purple-600 text-white p-6">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium bg-white/20 backdrop-blur-sm`}>
                    {procesoDetalle.OBJETO}
                  </span>
                  <h2 className="text-xl font-bold mt-2">{procesoDetalle.NOMENCLATURA}</h2>
                  <p className="text-violet-200 text-sm mt-1 flex items-center gap-1">
                    <Building2 size={14} />
                    {procesoDetalle.ENTIDAD}
                  </p>
                </div>
                <button
                  onClick={() => setProcesoDetalle(null)}
                  className="p-2 hover:bg-white/20 rounded-lg transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Contenido */}
            <div className="p-6 overflow-y-auto max-h-[55vh]">
              {/* Valor y fecha */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="p-4 bg-gradient-to-br from-emerald-50 to-green-50 rounded-xl border border-emerald-100">
                  <div className="flex items-center gap-2 text-emerald-600 mb-1">
                    <TrendingUp size={14} />
                    <span className="text-xs font-medium">Valor Referencial</span>
                  </div>
                  <p className="text-2xl font-bold text-emerald-700">
                    {formatearMonedaLocal(procesoDetalle.VALOR, procesoDetalle.MONEDA)}
                  </p>
                </div>
                <div className="p-4 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl border border-blue-100">
                  <div className="flex items-center gap-2 text-blue-600 mb-1">
                    <Calendar size={14} />
                    <span className="text-xs font-medium">Fecha Publicación</span>
                  </div>
                  <p className="text-lg font-bold text-blue-700">
                    {formatearFecha(procesoDetalle.FECHA_PUB)}
                  </p>
                </div>
              </div>

              {/* Descripción */}
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                  <FileText size={14} />
                  Descripción del Objeto
                </h3>
                <p className="text-gray-600 text-sm leading-relaxed bg-gray-50 p-4 rounded-xl border border-gray-100">
                  {procesoDetalle.DESCRIPCION}
                </p>
              </div>

              {/* Detalles adicionales */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="p-3 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-500 flex items-center gap-1">
                    <MapPin size={12} />
                    Región
                  </p>
                  <p className="font-semibold text-gray-900 mt-1">{procesoDetalle.REGION}</p>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-500">Versión SEACE</p>
                  <p className="font-semibold text-gray-900 mt-1">v{procesoDetalle.VERSION}</p>
                </div>
                {procesoDetalle.REINICIADO && (
                  <div className="col-span-2 p-3 bg-amber-50 rounded-lg border border-amber-100">
                    <p className="text-xs text-amber-600">Reiniciado desde</p>
                    <p className="font-semibold text-amber-700 mt-1">{procesoDetalle.REINICIADO}</p>
                  </div>
                )}
              </div>

              {/* Estado de seguimiento */}
              {estaEnSeguimiento(procesoDetalle.NOMENCLATURA) && (
                <div className="p-4 bg-amber-50 rounded-xl border border-amber-200">
                  <div className="flex items-center gap-2">
                    <Star size={16} className="text-amber-500 fill-amber-500" />
                    <span className="text-sm font-medium text-amber-700">Este proceso está en tu lista de seguimiento</span>
                  </div>
                </div>
              )}
            </div>

            {/* Footer con acciones */}
            <div className="border-t border-gray-100 p-4 bg-gray-50 flex flex-wrap gap-3">
              {!estaEnSeguimiento(procesoDetalle.NOMENCLATURA) && (
                <Button
                  variant="primary"
                  icon={<Star size={16} />}
                  onClick={() => {
                    agregarSeguimiento(procesoDetalle.NOMENCLATURA, 'PENDIENTE', 'MEDIA', '');
                    setProcesoDetalle(null);
                  }}
                  className="flex-1 min-w-[180px]"
                >
                  Agregar a Seguimiento
                </Button>
              )}
              {procesoDetalle.URL && (
                <Button
                  variant="outline"
                  icon={<ExternalLink size={16} />}
                  onClick={() => window.open(procesoDetalle.URL!, '_blank')}
                >
                  Ver en SEACE
                </Button>
              )}
              <Button
                variant="outline"
                onClick={() => {
                  setProcesoDetalle(null);
                  setVistaActiva('procesos');
                  setFiltros({ busqueda: procesoDetalle.NOMENCLATURA });
                }}
              >
                Ver en Tabla
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface ConfiguracionViewProps {
  configUrl: string;
  setConfigUrl: (url: string) => void;
  guardarConfig: () => void;
}

function ConfiguracionView({ configUrl, setConfigUrl, guardarConfig }: ConfiguracionViewProps) {
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Card>
        <CardHeader title="Configuracion" subtitle="Conecta tu Google Sheets" icon={<Settings size={20} />} />
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">URL de la API (Google Apps Script)</label>
            <Input value={configUrl} onChange={(e) => setConfigUrl(e.target.value)} placeholder="https://script.google.com/macros/s/xxx/exec" />
            <p className="text-xs text-gray-500 mt-1">Despliega el Apps Script como Web App y pega la URL aqui</p>
          </div>
          <Button onClick={guardarConfig} icon={<Save size={16} />}>Guardar y Recargar</Button>
        </div>
      </Card>
      <Card>
        <CardHeader title="Instrucciones" />
        <ol className="list-decimal list-inside space-y-2 text-sm text-gray-600">
          <li>Crea un nuevo Google Sheets</li>
          <li>Ve a Extensiones - Apps Script</li>
          <li>Pega el codigo del archivo GOOGLE_APPS_SCRIPT.js</li>
          <li>Guarda el proyecto</li>
          <li>Ve a Implementar - Nueva implementacion</li>
          <li>Selecciona Aplicacion web</li>
          <li>Configura acceso como Cualquier persona</li>
          <li>Copia la URL y pegala arriba</li>
          <li>En el Sheets, ve al menu SEACE Intelligence - Crear Hojas Base</li>
        </ol>
      </Card>
      <Card>
        <CardHeader title="Archivo Apps Script" />
        <p className="text-sm text-gray-600 mb-3">El codigo esta en el archivo GOOGLE_APPS_SCRIPT.js en la raiz del proyecto.</p>
        <Button variant="outline" icon={<ExternalLink size={16} />} onClick={() => window.open('https://script.google.com/', '_blank')}>Abrir Google Apps Script</Button>
      </Card>
    </div>
  );
}

export default App;
