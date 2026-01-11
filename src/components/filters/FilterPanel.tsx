import { useState, useMemo, useRef, useEffect } from 'react';
import { useStore } from '../../store/useStore';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { TIPOS_OBJETO, REGIONES_PERU } from '../../utils/constants';
import {
  Search,
  X,
  SlidersHorizontal,
  MapPin,
  Building2,
  Tag,
  ChevronDown,
  Sparkles,
  TrendingUp,
  Zap,
  Clock,
  Briefcase
} from 'lucide-react';
import type { EstadoFechaProceso } from '../../types';
import { clsx } from 'clsx';

// ==================== FILTRO PRINCIPAL SIMPLIFICADO ====================

export function FilterPanel() {
  const {
    filtros,
    setFiltros,
    limpiarFiltros,
    procesosFiltrados,
    procesos
  } = useStore();

  const [mostrarAvanzado, setMostrarAvanzado] = useState(false);
  const [inputBusqueda, setInputBusqueda] = useState(filtros.busqueda);

  // Debounce para búsqueda
  useEffect(() => {
    const timer = setTimeout(() => {
      if (inputBusqueda !== filtros.busqueda) {
        setFiltros({ busqueda: inputBusqueda });
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [inputBusqueda]);

  // Sincronizar input con filtros externos
  useEffect(() => {
    setInputBusqueda(filtros.busqueda);
  }, [filtros.busqueda]);

  const hayFiltrosActivos =
    filtros.busqueda ||
    filtros.regiones.length > 0 ||
    filtros.objetos.length > 0 ||
    filtros.palabrasClave.length > 0 ||
    filtros.entidades.length > 0 ||
    filtros.empresasCortas.length > 0 ||
    filtros.estadosFecha.length > 0 ||
    filtros.tiposServicio.length > 0;

  const totalFiltrosActivos =
    (filtros.busqueda ? 1 : 0) +
    filtros.regiones.length +
    filtros.objetos.length +
    filtros.palabrasClave.length +
    filtros.entidades.length +
    filtros.empresasCortas.length +
    filtros.estadosFecha.length +
    filtros.tiposServicio.length;

  return (
    <div className="space-y-3">
      {/* Barra de búsqueda principal */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <div className="flex gap-3">
          {/* Input de búsqueda principal */}
          <div className="flex-1 relative">
            <Search size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={inputBusqueda}
              onChange={(e) => setInputBusqueda(e.target.value)}
              placeholder="Buscar por descripción, entidad, nomenclatura..."
              className="w-full pl-12 pr-10 py-3 text-base border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-50 focus:bg-white transition-colors"
            />
            {inputBusqueda && (
              <button
                onClick={() => {
                  setInputBusqueda('');
                  setFiltros({ busqueda: '' });
                }}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X size={18} />
              </button>
            )}
          </div>

          {/* Botón filtros avanzados */}
          <Button
            variant={mostrarAvanzado ? 'primary' : 'outline'}
            onClick={() => setMostrarAvanzado(!mostrarAvanzado)}
            icon={<SlidersHorizontal size={18} />}
            className="relative"
          >
            Filtros
            {totalFiltrosActivos > 0 && !mostrarAvanzado && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-blue-600 text-white text-xs rounded-full flex items-center justify-center">
                {totalFiltrosActivos}
              </span>
            )}
          </Button>
        </div>

        {/* Chips de tipos de objeto (siempre visibles) */}
        <div className="flex flex-wrap gap-2 mt-3">
          {TIPOS_OBJETO.map(objeto => (
            <button
              key={objeto}
              onClick={() => {
                const nuevos = filtros.objetos.includes(objeto)
                  ? filtros.objetos.filter(o => o !== objeto)
                  : [...filtros.objetos, objeto];
                setFiltros({ objetos: nuevos });
              }}
              className={clsx(
                'px-3 py-1.5 rounded-full text-sm font-medium transition-all',
                filtros.objetos.includes(objeto)
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              )}
            >
              {objeto}
            </button>
          ))}
        </div>

        {/* v3.1: Chips de antigüedad (siempre visibles) */}
        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100">
          <span className="text-xs text-gray-500 flex items-center gap-1">
            <Clock size={14} />
            Antigüedad:
          </span>
          <AntiguedadQuickFilter />
        </div>
      </div>

      {/* Panel avanzado (colapsable) */}
      {mostrarAvanzado && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 animate-fadeIn">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Regiones */}
            <RegionSelector />

            {/* Entidades */}
            <EntidadSelector />
          </div>

          {/* v3.1: Filtros de clasificación automática */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4 pt-4 border-t border-gray-100">
            {/* Empresas (clasificación corta) */}
            <EmpresaCortaSelector />

            {/* Estado de fecha (antigüedad) */}
            <EstadoFechaSelector />

            {/* Tipo de servicio */}
            <TipoServicioSelector />
          </div>

          {/* Palabras clave */}
          <div className="mt-4">
            <PalabrasClaveInput />
          </div>

          {/* Acciones */}
          <div className="mt-4 pt-4 border-t border-gray-100 flex justify-between items-center">
            <span className="text-sm text-gray-500">
              {procesosFiltrados.length} de {procesos.length} procesos
            </span>
            {hayFiltrosActivos && (
              <Button variant="ghost" size="sm" onClick={limpiarFiltros}>
                Limpiar todos los filtros
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Barra de filtros activos */}
      <ActiveFiltersBar />
    </div>
  );
}

// ==================== SELECTOR DE REGIONES ====================

function RegionSelector() {
  const { filtros, setFiltros, regionesData } = useStore();
  const [abierto, setAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  // Cerrar al hacer clic fuera
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setAbierto(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const regionesFiltradas = useMemo(() => {
    if (!busqueda) return REGIONES_PERU;
    return REGIONES_PERU.filter(r =>
      r.toLowerCase().includes(busqueda.toLowerCase())
    );
  }, [busqueda]);

  const toggleRegion = (region: string) => {
    const nuevas = filtros.regiones.includes(region)
      ? filtros.regiones.filter(r => r !== region)
      : [...filtros.regiones, region];
    setFiltros({ regiones: nuevas });
  };

  return (
    <div ref={ref} className="relative">
      <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
        <MapPin size={16} />
        Regiones
        {filtros.regiones.length > 0 && (
          <Badge variant="info" size="sm">{filtros.regiones.length}</Badge>
        )}
      </label>

      {/* Dropdown trigger */}
      <button
        onClick={() => setAbierto(!abierto)}
        className={clsx(
          'w-full px-3 py-2.5 text-left border rounded-lg flex items-center justify-between transition-colors',
          abierto ? 'border-blue-500 ring-2 ring-blue-100' : 'border-gray-200 hover:border-gray-300'
        )}
      >
        <span className={filtros.regiones.length > 0 ? 'text-gray-900' : 'text-gray-400'}>
          {filtros.regiones.length > 0
            ? filtros.regiones.slice(0, 2).join(', ') + (filtros.regiones.length > 2 ? ` +${filtros.regiones.length - 2}` : '')
            : 'Seleccionar regiones'}
        </span>
        <ChevronDown size={18} className={clsx('text-gray-400 transition-transform', abierto && 'rotate-180')} />
      </button>

      {/* Dropdown */}
      {abierto && (
        <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-hidden">
          {/* Buscador */}
          <div className="p-2 border-b border-gray-100">
            <input
              type="text"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar región..."
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
          </div>

          {/* Lista */}
          <div className="max-h-48 overflow-y-auto">
            {regionesFiltradas.map(region => {
              const data = regionesData[region];
              const seleccionada = filtros.regiones.includes(region);
              return (
                <button
                  key={region}
                  onClick={() => toggleRegion(region)}
                  className={clsx(
                    'w-full px-3 py-2 text-left flex items-center justify-between hover:bg-gray-50',
                    seleccionada && 'bg-blue-50'
                  )}
                >
                  <div className="flex items-center gap-2">
                    <div className={clsx(
                      'w-4 h-4 rounded border-2 flex items-center justify-center transition-colors',
                      seleccionada ? 'bg-blue-600 border-blue-600' : 'border-gray-300'
                    )}>
                      {seleccionada && (
                        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                    <span className={seleccionada ? 'font-medium text-blue-700' : 'text-gray-700'}>
                      {region}
                    </span>
                  </div>
                  {data && (
                    <span className="text-xs text-gray-400">{data.count} procesos</span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Acciones rápidas */}
          {filtros.regiones.length > 0 && (
            <div className="p-2 border-t border-gray-100">
              <button
                onClick={() => setFiltros({ regiones: [] })}
                className="w-full text-center text-sm text-gray-500 hover:text-gray-700 py-1"
              >
                Limpiar selección
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ==================== SELECTOR DE ENTIDADES ====================

function EntidadSelector() {
  const { filtros, setFiltros, entidadesUnicas } = useStore();
  const [abierto, setAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setAbierto(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const entidadesFiltradas = useMemo(() => {
    const lista = entidadesUnicas || [];
    if (!busqueda.trim()) return lista.slice(0, 15);
    const b = busqueda.toLowerCase();
    return lista.filter(e => e.entidad.toLowerCase().includes(b)).slice(0, 15);
  }, [entidadesUnicas, busqueda]);

  const toggleEntidad = (entidad: string) => {
    const existe = filtros.entidades.includes(entidad);
    const nuevas = existe
      ? filtros.entidades.filter(e => e !== entidad)
      : [...filtros.entidades, entidad];
    setFiltros({ entidades: nuevas });
  };

  const truncarNombre = (nombre: string, max: number = 35) => {
    return nombre.length > max ? nombre.substring(0, max) + '...' : nombre;
  };

  return (
    <div ref={ref} className="relative">
      <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
        <Building2 size={16} />
        Entidades
        {filtros.entidades.length > 0 && (
          <Badge variant="info" size="sm">{filtros.entidades.length}</Badge>
        )}
      </label>

      {/* Input con autocomplete */}
      <div className="relative">
        <input
          type="text"
          value={busqueda}
          onChange={(e) => {
            setBusqueda(e.target.value);
            setAbierto(true);
          }}
          onFocus={() => setAbierto(true)}
          placeholder="Buscar entidad..."
          className={clsx(
            'w-full px-3 py-2.5 border rounded-lg transition-colors',
            abierto ? 'border-blue-500 ring-2 ring-blue-100' : 'border-gray-200'
          )}
        />
        {busqueda && (
          <button
            onClick={() => setBusqueda('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {/* Dropdown */}
      {abierto && entidadesFiltradas.length > 0 && (
        <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
          {entidadesFiltradas.map(({ entidad, count }) => {
            const seleccionada = filtros.entidades.includes(entidad);
            return (
              <button
                key={entidad}
                onClick={() => {
                  toggleEntidad(entidad);
                  setBusqueda('');
                }}
                className={clsx(
                  'w-full px-3 py-2 text-left flex items-center gap-2 hover:bg-gray-50',
                  seleccionada && 'bg-blue-50'
                )}
              >
                <div className={clsx(
                  'w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0',
                  seleccionada ? 'bg-blue-600 border-blue-600' : 'border-gray-300'
                )}>
                  {seleccionada && (
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <span className={clsx('text-sm', seleccionada ? 'font-medium text-blue-700' : 'text-gray-700')}>
                    {truncarNombre(entidad)}
                  </span>
                </div>
                <span className="text-xs text-gray-400 flex-shrink-0">{count}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Entidades seleccionadas */}
      {filtros.entidades.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {filtros.entidades.map(entidad => (
            <Badge
              key={entidad}
              variant="info"
              className="cursor-pointer hover:bg-blue-200"
            >
              {truncarNombre(entidad, 25)}
              <X size={12} className="ml-1" onClick={() => toggleEntidad(entidad)} />
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

// ==================== INPUT DE PALABRAS CLAVE ====================

function PalabrasClaveInput() {
  const { filtros, setFiltros, filtrosPalabras } = useStore();
  const [input, setInput] = useState('');

  const sugerencias = useMemo(() => {
    return (filtrosPalabras || [])
      .filter(f => f.activo && !filtros.palabrasClave.includes(f.palabra))
      .slice(0, 8);
  }, [filtrosPalabras, filtros.palabrasClave]);

  const agregarPalabra = (palabra: string) => {
    const p = palabra.trim();
    if (p && !filtros.palabrasClave.includes(p)) {
      setFiltros({ palabrasClave: [...filtros.palabrasClave, p] });
    }
    setInput('');
  };

  const quitarPalabra = (palabra: string) => {
    setFiltros({ palabrasClave: filtros.palabrasClave.filter(p => p !== palabra) });
  };

  return (
    <div>
      <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
        <Tag size={16} />
        Palabras clave
      </label>

      {/* Input */}
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              agregarPalabra(input);
            }
          }}
          placeholder="Escribir y presionar Enter..."
          className="flex-1 px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        {input && (
          <Button variant="primary" onClick={() => agregarPalabra(input)}>
            Agregar
          </Button>
        )}
      </div>

      {/* Sugerencias rápidas */}
      {sugerencias.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          <span className="text-xs text-gray-400 mr-1 py-1">Sugerencias:</span>
          {sugerencias.map(({ palabra }) => (
            <button
              key={palabra}
              onClick={() => agregarPalabra(palabra)}
              className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded-full hover:bg-blue-100 hover:text-blue-700 transition-colors"
            >
              + {palabra}
            </button>
          ))}
        </div>
      )}

      {/* Palabras activas */}
      {filtros.palabrasClave.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {filtros.palabrasClave.map(palabra => (
            <Badge key={palabra} variant="purple" className="cursor-pointer">
              {palabra}
              <X size={12} className="ml-1" onClick={() => quitarPalabra(palabra)} />
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

// ==================== v3.1: FILTRO RÁPIDO DE ANTIGÜEDAD ====================

function AntiguedadQuickFilter() {
  const { filtros, setFiltros, procesos } = useStore();

  // Contar procesos por estado de fecha
  const conteoEstados = useMemo(() => {
    const conteo: Record<string, number> = {};
    (procesos || []).forEach(p => {
      if (p.ESTADO_FECHA) {
        conteo[p.ESTADO_FECHA] = (conteo[p.ESTADO_FECHA] || 0) + 1;
      }
    });
    return conteo;
  }, [procesos]);

  const toggleEstado = (estado: EstadoFechaProceso) => {
    const nuevos = filtros.estadosFecha.includes(estado)
      ? filtros.estadosFecha.filter(e => e !== estado)
      : [...filtros.estadosFecha, estado];
    setFiltros({ estadosFecha: nuevos });
  };

  const opciones: { valor: EstadoFechaProceso; label: string; colorBase: string; colorActivo: string }[] = [
    { valor: 'ESTA SEMANA', label: 'Esta semana', colorBase: 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200', colorActivo: 'bg-emerald-600 text-white' },
    { valor: 'ESTE MES', label: 'Este mes', colorBase: 'bg-blue-100 text-blue-700 hover:bg-blue-200', colorActivo: 'bg-blue-600 text-white' },
    { valor: 'ULTIMO TRIMESTRE', label: 'Últ. trimestre', colorBase: 'bg-amber-100 text-amber-700 hover:bg-amber-200', colorActivo: 'bg-amber-600 text-white' },
    { valor: 'ANTIGUO', label: 'Antiguo', colorBase: 'bg-gray-200 text-gray-700 hover:bg-gray-300', colorActivo: 'bg-gray-600 text-white' },
  ];

  return (
    <div className="flex flex-wrap gap-2">
      {opciones.map(({ valor, label, colorBase, colorActivo }) => {
        const seleccionado = filtros.estadosFecha.includes(valor);
        const count = conteoEstados[valor] || 0;
        return (
          <button
            key={valor}
            onClick={() => toggleEstado(valor)}
            className={clsx(
              'px-3 py-1.5 rounded-full text-xs font-medium transition-all flex items-center gap-1.5',
              seleccionado ? colorActivo + ' shadow-sm' : colorBase
            )}
          >
            {label}
            {count > 0 && (
              <span className={clsx(
                'px-1.5 py-0.5 rounded-full text-[10px] font-bold',
                seleccionado ? 'bg-white/20' : 'bg-black/10'
              )}>
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ==================== v3.1: SELECTOR DE EMPRESA CORTA ====================

function EmpresaCortaSelector() {
  const { filtros, setFiltros, procesos } = useStore();
  const [abierto, setAbierto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setAbierto(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Obtener empresas disponibles en los datos actuales
  const empresasDisponibles = useMemo(() => {
    const conteo: Record<string, number> = {};
    (procesos || []).forEach(p => {
      if (p.EMPRESA_CORTA) {
        conteo[p.EMPRESA_CORTA] = (conteo[p.EMPRESA_CORTA] || 0) + 1;
      }
    });
    return Object.entries(conteo)
      .sort((a, b) => b[1] - a[1])
      .map(([empresa, count]) => ({ empresa, count }));
  }, [procesos]);

  const toggleEmpresa = (empresa: string) => {
    const nuevas = filtros.empresasCortas.includes(empresa)
      ? filtros.empresasCortas.filter(e => e !== empresa)
      : [...filtros.empresasCortas, empresa];
    setFiltros({ empresasCortas: nuevas });
  };

  return (
    <div ref={ref} className="relative">
      <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
        <Zap size={16} className="text-yellow-500" />
        Empresa
        {filtros.empresasCortas.length > 0 && (
          <Badge variant="warning" size="sm">{filtros.empresasCortas.length}</Badge>
        )}
      </label>

      <button
        onClick={() => setAbierto(!abierto)}
        className={clsx(
          'w-full px-3 py-2.5 text-left border rounded-lg flex items-center justify-between transition-colors text-sm',
          abierto ? 'border-yellow-500 ring-2 ring-yellow-100' : 'border-gray-200 hover:border-gray-300'
        )}
      >
        <span className={filtros.empresasCortas.length > 0 ? 'text-gray-900' : 'text-gray-400'}>
          {filtros.empresasCortas.length > 0
            ? filtros.empresasCortas.slice(0, 2).join(', ') + (filtros.empresasCortas.length > 2 ? ` +${filtros.empresasCortas.length - 2}` : '')
            : 'Seleccionar empresa'}
        </span>
        <ChevronDown size={18} className={clsx('text-gray-400 transition-transform', abierto && 'rotate-180')} />
      </button>

      {abierto && (
        <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
          {empresasDisponibles.length > 0 ? (
            empresasDisponibles.map(({ empresa, count }) => {
              const seleccionada = filtros.empresasCortas.includes(empresa);
              return (
                <button
                  key={empresa}
                  onClick={() => toggleEmpresa(empresa)}
                  className={clsx(
                    'w-full px-3 py-2 text-left flex items-center justify-between hover:bg-gray-50 text-sm',
                    seleccionada && 'bg-yellow-50'
                  )}
                >
                  <div className="flex items-center gap-2">
                    <div className={clsx(
                      'w-4 h-4 rounded border-2 flex items-center justify-center transition-colors',
                      seleccionada ? 'bg-yellow-500 border-yellow-500' : 'border-gray-300'
                    )}>
                      {seleccionada && (
                        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                    <span className={seleccionada ? 'font-medium text-yellow-700' : 'text-gray-700'}>
                      {empresa}
                    </span>
                  </div>
                  <span className="text-xs text-gray-400">{count}</span>
                </button>
              );
            })
          ) : (
            <div className="px-3 py-4 text-sm text-gray-500 text-center">
              No hay datos de empresas
            </div>
          )}

          {filtros.empresasCortas.length > 0 && (
            <div className="p-2 border-t border-gray-100">
              <button
                onClick={() => setFiltros({ empresasCortas: [] })}
                className="w-full text-center text-sm text-gray-500 hover:text-gray-700 py-1"
              >
                Limpiar selección
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ==================== v3.1: SELECTOR DE ESTADO FECHA ====================

const ESTADOS_FECHA: { valor: EstadoFechaProceso; label: string; color: string }[] = [
  { valor: 'ESTA SEMANA', label: 'Esta semana', color: 'bg-emerald-100 text-emerald-800' },
  { valor: 'ESTE MES', label: 'Este mes', color: 'bg-blue-100 text-blue-800' },
  { valor: 'ULTIMO TRIMESTRE', label: 'Últ. trimestre', color: 'bg-amber-100 text-amber-800' },
  { valor: 'ANTIGUO', label: 'Antiguo', color: 'bg-gray-100 text-gray-800' },
];

function EstadoFechaSelector() {
  const { filtros, setFiltros, procesos } = useStore();

  // Contar procesos por estado de fecha
  const conteoEstados = useMemo(() => {
    const conteo: Record<string, number> = {};
    (procesos || []).forEach(p => {
      if (p.ESTADO_FECHA) {
        conteo[p.ESTADO_FECHA] = (conteo[p.ESTADO_FECHA] || 0) + 1;
      }
    });
    return conteo;
  }, [procesos]);

  const toggleEstado = (estado: EstadoFechaProceso) => {
    const nuevos = filtros.estadosFecha.includes(estado)
      ? filtros.estadosFecha.filter(e => e !== estado)
      : [...filtros.estadosFecha, estado];
    setFiltros({ estadosFecha: nuevos });
  };

  return (
    <div>
      <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
        <Clock size={16} className="text-blue-500" />
        Antigüedad
        {filtros.estadosFecha.length > 0 && (
          <Badge variant="info" size="sm">{filtros.estadosFecha.length}</Badge>
        )}
      </label>

      <div className="flex flex-wrap gap-2">
        {ESTADOS_FECHA.map(({ valor, label, color }) => {
          const seleccionado = filtros.estadosFecha.includes(valor);
          const count = conteoEstados[valor] || 0;
          return (
            <button
              key={valor}
              onClick={() => toggleEstado(valor)}
              className={clsx(
                'px-3 py-1.5 rounded-full text-xs font-medium transition-all flex items-center gap-1',
                seleccionado
                  ? 'bg-blue-600 text-white shadow-sm'
                  : color + ' hover:opacity-80'
              )}
            >
              {label}
              {count > 0 && (
                <span className={clsx(
                  'text-xs',
                  seleccionado ? 'text-blue-200' : 'opacity-60'
                )}>
                  ({count})
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ==================== v3.1: SELECTOR DE TIPO DE SERVICIO ====================

function TipoServicioSelector() {
  const { filtros, setFiltros, procesos } = useStore();
  const [abierto, setAbierto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setAbierto(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Obtener tipos de servicio disponibles
  const tiposDisponibles = useMemo(() => {
    const conteo: Record<string, number> = {};
    (procesos || []).forEach(p => {
      if (p.TIPO_SERVICIO) {
        conteo[p.TIPO_SERVICIO] = (conteo[p.TIPO_SERVICIO] || 0) + 1;
      }
    });
    return Object.entries(conteo)
      .sort((a, b) => b[1] - a[1])
      .map(([tipo, count]) => ({ tipo, count }));
  }, [procesos]);

  const toggleTipo = (tipo: string) => {
    const nuevos = filtros.tiposServicio.includes(tipo)
      ? filtros.tiposServicio.filter(t => t !== tipo)
      : [...filtros.tiposServicio, tipo];
    setFiltros({ tiposServicio: nuevos });
  };

  return (
    <div ref={ref} className="relative">
      <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
        <Briefcase size={16} className="text-purple-500" />
        Tipo Servicio
        {filtros.tiposServicio.length > 0 && (
          <Badge variant="purple" size="sm">{filtros.tiposServicio.length}</Badge>
        )}
      </label>

      <button
        onClick={() => setAbierto(!abierto)}
        className={clsx(
          'w-full px-3 py-2.5 text-left border rounded-lg flex items-center justify-between transition-colors text-sm',
          abierto ? 'border-purple-500 ring-2 ring-purple-100' : 'border-gray-200 hover:border-gray-300'
        )}
      >
        <span className={filtros.tiposServicio.length > 0 ? 'text-gray-900' : 'text-gray-400'}>
          {filtros.tiposServicio.length > 0
            ? filtros.tiposServicio.slice(0, 2).join(', ') + (filtros.tiposServicio.length > 2 ? ` +${filtros.tiposServicio.length - 2}` : '')
            : 'Seleccionar tipo'}
        </span>
        <ChevronDown size={18} className={clsx('text-gray-400 transition-transform', abierto && 'rotate-180')} />
      </button>

      {abierto && (
        <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
          {tiposDisponibles.length > 0 ? (
            tiposDisponibles.map(({ tipo, count }) => {
              const seleccionado = filtros.tiposServicio.includes(tipo);
              return (
                <button
                  key={tipo}
                  onClick={() => toggleTipo(tipo)}
                  className={clsx(
                    'w-full px-3 py-2 text-left flex items-center justify-between hover:bg-gray-50 text-sm',
                    seleccionado && 'bg-purple-50'
                  )}
                >
                  <div className="flex items-center gap-2">
                    <div className={clsx(
                      'w-4 h-4 rounded border-2 flex items-center justify-center transition-colors',
                      seleccionado ? 'bg-purple-500 border-purple-500' : 'border-gray-300'
                    )}>
                      {seleccionado && (
                        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                    <span className={seleccionado ? 'font-medium text-purple-700' : 'text-gray-700'}>
                      {tipo}
                    </span>
                  </div>
                  <span className="text-xs text-gray-400">{count}</span>
                </button>
              );
            })
          ) : (
            <div className="px-3 py-4 text-sm text-gray-500 text-center">
              No hay datos de tipos de servicio
            </div>
          )}

          {filtros.tiposServicio.length > 0 && (
            <div className="p-2 border-t border-gray-100">
              <button
                onClick={() => setFiltros({ tiposServicio: [] })}
                className="w-full text-center text-sm text-gray-500 hover:text-gray-700 py-1"
              >
                Limpiar selección
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ==================== BARRA DE FILTROS ACTIVOS ====================

export function ActiveFiltersBar() {
  const { filtros, setFiltros, limpiarFiltros, procesosFiltrados, procesos } = useStore();

  const regiones = filtros?.regiones || [];
  const objetos = filtros?.objetos || [];
  const palabrasClave = filtros?.palabrasClave || [];
  const entidades = filtros?.entidades || [];
  const empresasCortas = filtros?.empresasCortas || [];
  const estadosFecha = filtros?.estadosFecha || [];
  const tiposServicio = filtros?.tiposServicio || [];

  const hayFiltrosActivos =
    filtros?.busqueda ||
    regiones.length > 0 ||
    objetos.length > 0 ||
    palabrasClave.length > 0 ||
    entidades.length > 0 ||
    empresasCortas.length > 0 ||
    estadosFecha.length > 0 ||
    tiposServicio.length > 0;

  if (!hayFiltrosActivos) return null;

  const totalFiltros = regiones.length + objetos.length + palabrasClave.length + entidades.length + empresasCortas.length + estadosFecha.length + tiposServicio.length + (filtros?.busqueda ? 1 : 0);

  return (
    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl px-4 py-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-blue-600" />
          <span className="text-sm font-medium text-blue-800">
            {(procesosFiltrados || []).length} resultado{(procesosFiltrados || []).length !== 1 ? 's' : ''}
          </span>
          <span className="text-sm text-blue-600">
            de {(procesos || []).length} procesos
          </span>
        </div>
        <button
          onClick={limpiarFiltros}
          className="text-sm text-blue-600 hover:text-blue-800 font-medium"
        >
          Limpiar todo ({totalFiltros})
        </button>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {filtros?.busqueda && (
          <FilterChip
            label={`"${filtros.busqueda}"`}
            color="gray"
            onRemove={() => setFiltros({ busqueda: '' })}
          />
        )}

        {objetos.map(o => (
          <FilterChip
            key={o}
            label={o}
            color="green"
            onRemove={() => setFiltros({ objetos: objetos.filter(x => x !== o) })}
          />
        ))}

        {regiones.map(r => (
          <FilterChip
            key={r}
            label={r}
            color="blue"
            icon={<MapPin size={12} />}
            onRemove={() => setFiltros({ regiones: regiones.filter(x => x !== r) })}
          />
        ))}

        {entidades.map(e => (
          <FilterChip
            key={e}
            label={e.length > 25 ? e.substring(0, 25) + '...' : e}
            color="orange"
            icon={<Building2 size={12} />}
            onRemove={() => setFiltros({ entidades: entidades.filter(x => x !== e) })}
          />
        ))}

        {palabrasClave.map(p => (
          <FilterChip
            key={p}
            label={p}
            color="purple"
            icon={<Tag size={12} />}
            onRemove={() => setFiltros({ palabrasClave: palabrasClave.filter(x => x !== p) })}
          />
        ))}

        {empresasCortas.map(e => (
          <FilterChip
            key={e}
            label={e}
            color="orange"
            icon={<Zap size={12} />}
            onRemove={() => setFiltros({ empresasCortas: empresasCortas.filter(x => x !== e) })}
          />
        ))}

        {estadosFecha.map(e => (
          <FilterChip
            key={e}
            label={e === 'ULTIMO TRIMESTRE' ? 'Últ. trim.' : e.toLowerCase().replace(/^\w/, c => c.toUpperCase())}
            color="blue"
            icon={<Clock size={12} />}
            onRemove={() => setFiltros({ estadosFecha: estadosFecha.filter(x => x !== e) })}
          />
        ))}

        {tiposServicio.map(t => (
          <FilterChip
            key={t}
            label={t}
            color="purple"
            icon={<Briefcase size={12} />}
            onRemove={() => setFiltros({ tiposServicio: tiposServicio.filter(x => x !== t) })}
          />
        ))}
      </div>
    </div>
  );
}

// ==================== CHIP DE FILTRO ====================

interface FilterChipProps {
  label: string;
  color: 'blue' | 'green' | 'orange' | 'purple' | 'gray';
  icon?: React.ReactNode;
  onRemove: () => void;
}

function FilterChip({ label, color, icon, onRemove }: FilterChipProps) {
  const colors = {
    blue: 'bg-blue-100 text-blue-800 hover:bg-blue-200',
    green: 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200',
    orange: 'bg-orange-100 text-orange-800 hover:bg-orange-200',
    purple: 'bg-purple-100 text-purple-800 hover:bg-purple-200',
    gray: 'bg-gray-100 text-gray-800 hover:bg-gray-200'
  };

  return (
    <span className={clsx(
      'inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium transition-colors',
      colors[color]
    )}>
      {icon}
      {label}
      <button onClick={onRemove} className="ml-0.5 hover:opacity-70">
        <X size={12} />
      </button>
    </span>
  );
}

// ==================== FILTROS RÁPIDOS (PRESETS) ====================

export function QuickFilters() {
  const { setFiltros, limpiarFiltros } = useStore();

  const presets = [
    {
      id: 'servicios-lima',
      label: 'Servicios en Lima',
      icon: <TrendingUp size={14} />,
      apply: () => {
        limpiarFiltros();
        setFiltros({ objetos: ['Servicio'], regiones: ['LIMA'] });
      }
    },
    {
      id: 'obras-alto-valor',
      label: 'Obras',
      icon: <Building2 size={14} />,
      apply: () => {
        limpiarFiltros();
        setFiltros({ objetos: ['Obra'] });
      }
    },
    {
      id: 'consultoria',
      label: 'Consultorías',
      icon: <Sparkles size={14} />,
      apply: () => {
        limpiarFiltros();
        setFiltros({ objetos: ['Consultoría de Obra'] });
      }
    }
  ];

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-500">Filtros rápidos:</span>
      {presets.map(preset => (
        <button
          key={preset.id}
          onClick={preset.apply}
          className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-white border border-gray-200 rounded-full text-gray-600 hover:border-blue-300 hover:text-blue-600 transition-colors"
        >
          {preset.icon}
          {preset.label}
        </button>
      ))}
    </div>
  );
}
