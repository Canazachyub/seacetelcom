import { useMemo, useState, useEffect } from 'react';
import { useStore } from '../../store/useStore';
import { Card, CardHeader, StatCard } from '../ui/Card';
import { PeruMap } from '../map/PeruMap';
import { getEnlacesRapidos } from '../../services/api';
import type { EnlaceRapido } from '../../types';
import {
  FileText,
  Building2,
  MapPin,
  DollarSign,
  Star,
  X,
  Filter,
  Calendar,
  ExternalLink,
  Search,
  Database,
  Sparkles,
  BookOpen,
  MessageSquare,
  Link2,
  Brain
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend
} from 'recharts';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];

export function Dashboard() {
  const {
    estadisticas,
    seguimiento,
    procesos,
    procesosFiltrados,
    filtros,
    setFiltros,
    setVistaActiva
  } = useStore();

  const [busquedaEntidad, setBusquedaEntidad] = useState('');
  const [enlacesRapidos, setEnlacesRapidos] = useState<EnlaceRapido[]>([]);

  // Cargar enlaces rápidos
  useEffect(() => {
    getEnlacesRapidos().then(setEnlacesRapidos);
  }, []);

  // Nota: Los datos ya se cargan en App.tsx via cargarTodo()
  // No duplicamos las llamadas aquí

  // Calcular estadísticas dinámicas basadas en regiones seleccionadas
  const statsCalculados = useMemo(() => {
    const procesosArray = procesos || [];
    const procesosBase = filtros.regiones.length > 0
      ? procesosArray.filter(p => filtros.regiones.includes(p.REGION))
      : procesosArray;

    // Calcular top entidades de los procesos filtrados por región
    const entidadesCount: Record<string, number> = {};
    const entidadesValor: Record<string, number> = {};
    procesosBase.forEach(p => {
      entidadesCount[p.ENTIDAD] = (entidadesCount[p.ENTIDAD] || 0) + 1;
      entidadesValor[p.ENTIDAD] = (entidadesValor[p.ENTIDAD] || 0) + (p.VALOR || 0);
    });

    const todasEntidades = Object.entries(entidadesCount)
      .sort((a, b) => b[1] - a[1])
      .map(([entidad, count]) => ({
        entidad,
        count,
        valor: entidadesValor[entidad] || 0
      }));

    // Calcular estadísticas por objeto
    const porObjeto: Record<string, number> = {};
    procesosBase.forEach(p => {
      porObjeto[p.OBJETO] = (porObjeto[p.OBJETO] || 0) + 1;
    });

    // Calcular estadísticas por región
    const porRegion: Record<string, number> = {};
    procesosBase.forEach(p => {
      porRegion[p.REGION] = (porRegion[p.REGION] || 0) + 1;
    });

    return {
      totalProcesos: procesosBase.length,
      valorTotal: procesosBase.reduce((acc, p) => acc + (p.VALOR || 0), 0),
      todasEntidades,
      porObjeto,
      porRegion
    };
  }, [procesos, filtros.regiones]);

  // Toggle de entidad seleccionada
  const toggleEntidad = (entidad: string) => {
    const nuevasEntidades = filtros.entidades.includes(entidad)
      ? filtros.entidades.filter(e => e !== entidad)
      : [...filtros.entidades, entidad];
    setFiltros({ entidades: nuevasEntidades });
  };

  // Limpiar filtro de entidades
  const limpiarEntidades = () => {
    setFiltros({ entidades: [] });
  };

  // Formatear moneda
  const formatearMonedaLocal = (valor: number, moneda: string = 'PEN') => {
    return new Intl.NumberFormat('es-PE', {
      style: 'currency',
      currency: moneda === 'USD' ? 'USD' : 'PEN',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(valor);
  };

  // Formatear fecha
  const formatearFecha = (fecha: string | Date) => {
    return new Date(fecha).toLocaleDateString('es-PE', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  };

  if (!estadisticas) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-500">Cargando estadísticas...</p>
      </div>
    );
  }

  const dataPorObjeto = Object.entries(statsCalculados.porObjeto).map(([name, value]) => ({
    name,
    value
  }));

  const dataTopRegiones = Object.entries(statsCalculados.porRegion)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, value]) => ({ name, value }));

  // Determinar si hay filtros activos
  const hayFiltrosActivos = filtros.regiones.length > 0 || filtros.entidades.length > 0;

  // Helper para obtener icono según el nombre
  const getIcono = (iconoNombre?: string) => {
    const iconos: Record<string, React.ReactNode> = {
      'Database': <Database size={20} />,
      'Sparkles': <Sparkles size={20} />,
      'BookOpen': <BookOpen size={20} />,
      'MessageSquare': <MessageSquare size={20} />,
      'Brain': <Brain size={20} />,
      'Link2': <Link2 size={20} />,
      'ExternalLink': <ExternalLink size={20} />,
    };
    return iconos[iconoNombre || ''] || <Link2 size={20} />;
  };

  // Agrupar enlaces por categoría
  const enlacesPorCategoria = enlacesRapidos.reduce((acc, enlace) => {
    const cat = enlace.categoria || 'otro';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(enlace);
    return acc;
  }, {} as Record<string, EnlaceRapido[]>);

  return (
    <div className="space-y-6">
      {/* Enlaces Rápidos */}
      {enlacesRapidos.length > 0 && (
        <div className="bg-gradient-to-r from-slate-50 to-gray-50 rounded-xl p-4 border border-gray-200">
          <div className="flex items-center gap-2 mb-3">
            <Link2 size={18} className="text-gray-600" />
            <span className="text-sm font-semibold text-gray-700">Accesos Rápidos</span>
          </div>
          <div className="flex flex-wrap gap-3">
            {/* Dashboards */}
            {enlacesPorCategoria['dashboard']?.map(enlace => (
              <a
                key={enlace.id}
                href={enlace.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-white font-medium text-sm transition-all hover:scale-105 hover:shadow-lg"
                style={{ backgroundColor: enlace.color || '#3b82f6' }}
              >
                {getIcono(enlace.icono)}
                {enlace.nombre}
                <ExternalLink size={14} className="opacity-70" />
              </a>
            ))}

            {/* Separador si hay IA */}
            {enlacesPorCategoria['ia'] && enlacesPorCategoria['ia'].length > 0 && (
              <>
                <div className="flex items-center gap-2 ml-2">
                  <Brain size={16} className="text-purple-500" />
                  <span className="text-xs font-medium text-purple-600 uppercase tracking-wide">IA</span>
                </div>
                {enlacesPorCategoria['ia'].map(enlace => (
                  <a
                    key={enlace.id}
                    href={enlace.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-white font-medium text-sm transition-all hover:scale-105 hover:shadow-md"
                    style={{ backgroundColor: enlace.color || '#8b5cf6' }}
                  >
                    {getIcono(enlace.icono)}
                    {enlace.nombre}
                  </a>
                ))}
              </>
            )}

            {/* Otros */}
            {enlacesPorCategoria['herramienta']?.map(enlace => (
              <a
                key={enlace.id}
                href={enlace.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-600 text-white font-medium text-sm transition-all hover:scale-105 hover:shadow-md"
              >
                {getIcono(enlace.icono)}
                {enlace.nombre}
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Barra de filtros activos */}
      {hayFiltrosActivos && (
        <div className="bg-gradient-to-r from-violet-50 to-purple-50 rounded-xl p-4 border border-violet-200">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <Filter size={16} className="text-violet-600" />
              <span className="text-sm font-medium text-violet-700">Filtros activos:</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {filtros.regiones.map(region => (
                <span key={region} className="inline-flex items-center gap-1 px-2 py-1 bg-violet-100 text-violet-700 text-xs rounded-full">
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
              {filtros.entidades.map(entidad => (
                <span key={entidad} className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-full">
                  <Building2 size={10} />
                  {entidad.length > 20 ? entidad.substring(0, 20) + '...' : entidad}
                  <button
                    onClick={() => toggleEntidad(entidad)}
                    className="hover:text-blue-900 ml-0.5"
                  >
                    <X size={10} />
                  </button>
                </span>
              ))}
            </div>
            <button
              onClick={() => setFiltros({ regiones: [], entidades: [] })}
              className="text-xs text-red-600 hover:text-red-700 font-medium flex items-center gap-1"
            >
              <X size={12} />
              Limpiar todo
            </button>
          </div>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title={hayFiltrosActivos ? "Procesos Filtrados" : "Total Procesos"}
          value={hayFiltrosActivos ? (procesosFiltrados || []).length : statsCalculados.totalProcesos}
          icon={<FileText size={24} />}
          color="blue"
        />
        <StatCard
          title={hayFiltrosActivos ? "Valor Filtrado" : "Valor Total"}
          value={formatearMonedaLocal(hayFiltrosActivos
            ? (procesosFiltrados || []).reduce((acc, p) => acc + (p.VALOR || 0), 0)
            : statsCalculados.valorTotal
          )}
          icon={<DollarSign size={24} />}
          color="green"
        />
        <StatCard
          title="Regiones"
          value={filtros.regiones.length > 0 ? filtros.regiones.length : Object.keys(estadisticas.porRegion || {}).length}
          icon={<MapPin size={24} />}
          color="yellow"
        />
        <StatCard
          title="En Seguimiento"
          value={(seguimiento || []).length}
          icon={<Star size={24} />}
          color="purple"
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Por tipo de objeto */}
        <Card>
          <CardHeader
            title="Por Tipo de Objeto"
            subtitle="Distribución de procesos"
            icon={<FileText size={20} />}
          />
          <div className="h-64 min-h-[256px]">
            {dataPorObjeto.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%" debounce={50} minWidth={200} minHeight={200}>
                <PieChart>
                  <Pie
                    data={dataPorObjeto}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {dataPorObjeto.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-gray-400">
                <p className="text-sm">Sin datos disponibles</p>
              </div>
            )}
          </div>
        </Card>

        {/* Por región */}
        <Card>
          <CardHeader
            title="Top Regiones"
            subtitle="Regiones con más procesos"
            icon={<MapPin size={20} />}
          />
          <div className="h-64 min-h-[256px]">
            {dataTopRegiones.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%" debounce={50} minWidth={200} minHeight={200}>
                <BarChart data={dataTopRegiones} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={80}
                    tick={{ fontSize: 12 }}
                  />
                  <Tooltip />
                  <Bar dataKey="value" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-gray-400">
                <p className="text-sm">Sin datos disponibles</p>
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Map and Top Entidades */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Mapa */}
        <Card>
          <CardHeader
            title="Mapa de Procesos"
            subtitle="Click en una región para filtrar"
            icon={<MapPin size={20} />}
          />
          <PeruMap className="h-[400px]" />
        </Card>

        {/* Todas las Entidades */}
        <Card>
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Building2 size={20} className="text-blue-600" />
                Entidades
                <span className="text-sm font-normal text-gray-500">
                  ({statsCalculados.todasEntidades.length})
                </span>
              </h3>
              <p className="text-sm text-gray-500">
                {filtros.regiones.length > 0
                  ? `En ${filtros.regiones.join(', ')}`
                  : 'Todas las regiones'} - Click para filtrar
              </p>
            </div>
            {filtros.entidades.length > 0 && (
              <button
                onClick={limpiarEntidades}
                className="text-xs text-red-600 hover:text-red-700 font-medium flex items-center gap-1"
              >
                <X size={12} />
                Limpiar ({filtros.entidades.length})
              </button>
            )}
          </div>

          {/* Búsqueda de entidades */}
          <div className="relative mb-3">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar entidad..."
              value={busquedaEntidad}
              onChange={(e) => setBusquedaEntidad(e.target.value)}
              className="w-full pl-9 pr-8 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            {busquedaEntidad && (
              <button
                onClick={() => setBusquedaEntidad('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Lista de entidades con scroll */}
          <div className="space-y-1.5 max-h-[350px] overflow-y-auto pr-1">
            {statsCalculados.todasEntidades
              .filter(({ entidad }) =>
                !busquedaEntidad || entidad.toLowerCase().includes(busquedaEntidad.toLowerCase())
              )
              .map(({ entidad, count, valor }, index) => {
                const isSelected = filtros.entidades.includes(entidad);
                return (
                  <div
                    key={entidad}
                    onClick={() => toggleEntidad(entidad)}
                    className={`flex items-center justify-between p-2.5 rounded-lg cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-blue-100 border-2 border-blue-500 shadow-sm'
                        : 'bg-gray-50 border-2 border-transparent hover:bg-blue-50 hover:border-blue-200'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className={`w-5 h-5 flex items-center justify-center rounded-full text-xs font-medium flex-shrink-0 ${
                        isSelected ? 'bg-blue-600 text-white' : 'bg-blue-100 text-blue-700'
                      }`}>
                        {index + 1}
                      </span>
                      <span className={`text-sm font-medium truncate ${
                        isSelected ? 'text-blue-900' : 'text-gray-900'
                      }`} title={entidad}>
                        {entidad}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-xs text-emerald-600 font-medium hidden sm:inline">
                        {formatearMonedaLocal(valor)}
                      </span>
                      <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${
                        isSelected ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'
                      }`}>
                        {count}
                      </span>
                    </div>
                  </div>
                );
              })}
            {statsCalculados.todasEntidades.filter(({ entidad }) =>
              !busquedaEntidad || entidad.toLowerCase().includes(busquedaEntidad.toLowerCase())
            ).length === 0 && (
              <div className="text-center py-8 text-gray-400">
                <Building2 size={32} className="mx-auto mb-2 text-gray-300" />
                <p className="text-sm">
                  {busquedaEntidad ? 'No se encontraron entidades' : 'No hay entidades en esta selección'}
                </p>
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Tabla de procesos filtrados */}
      {hayFiltrosActivos && (procesosFiltrados || []).length > 0 && (
        <Card>
          <CardHeader
            title="Procesos Filtrados"
            subtitle={`${(procesosFiltrados || []).length} procesos encontrados`}
            icon={<FileText size={20} />}
          />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">Nomenclatura</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">Entidad</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">Objeto</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700">Región</th>
                  <th className="text-right py-3 px-4 font-semibold text-gray-700">Valor</th>
                  <th className="text-center py-3 px-4 font-semibold text-gray-700">Fecha</th>
                  <th className="text-center py-3 px-4 font-semibold text-gray-700"></th>
                </tr>
              </thead>
              <tbody>
                {(procesosFiltrados || []).slice(0, 15).map((p, idx) => (
                  <tr
                    key={p.ID}
                    className={`border-b border-gray-100 hover:bg-gray-50 transition-colors ${
                      idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'
                    }`}
                  >
                    <td className="py-3 px-4">
                      <span className="font-medium text-violet-700">{p.NOMENCLATURA}</span>
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-gray-900 truncate block max-w-[200px]" title={p.ENTIDAD}>
                        {p.ENTIDAD}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        p.OBJETO === 'Servicio' ? 'bg-blue-100 text-blue-700' :
                        p.OBJETO === 'Bien' ? 'bg-emerald-100 text-emerald-700' :
                        p.OBJETO === 'Obra' ? 'bg-amber-100 text-amber-700' :
                        'bg-purple-100 text-purple-700'
                      }`}>
                        {p.OBJETO}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-gray-600 flex items-center gap-1">
                        <MapPin size={12} />
                        {p.REGION}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <span className="font-semibold text-emerald-600">
                        {formatearMonedaLocal(p.VALOR, p.MONEDA)}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="text-gray-500 text-xs flex items-center justify-center gap-1">
                        <Calendar size={12} />
                        {formatearFecha(p.FECHA_PUB)}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      {p.URL && (
                        <a
                          href={p.URL}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-violet-600 hover:text-violet-800"
                          title="Ver en SEACE"
                        >
                          <ExternalLink size={16} />
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {(procesosFiltrados || []).length > 15 && (
            <div className="text-center py-4 border-t border-gray-100">
              <p className="text-sm text-gray-500">
                Mostrando 15 de {(procesosFiltrados || []).length} procesos.
                <button
                  onClick={() => setVistaActiva('procesos')}
                  className="text-violet-600 hover:text-violet-700 ml-1 font-medium"
                >
                  Ver todos en la vista de Procesos →
                </button>
              </p>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
