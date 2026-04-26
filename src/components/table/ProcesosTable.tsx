import { useState, useMemo, useEffect, useCallback, memo } from 'react';
import { List, type RowComponentProps } from 'react-window';
import { useStore } from '../../store/useStore';
import { Badge, EstadoBadge, PrioridadBadge, EmpresaCortaBadge, EstadoFechaBadge, TipoServicioBadge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { formatearMoneda, formatearFecha } from '../../utils/constants';
import { ProcesoHistoricos, HistoricosIndicador } from '../proceso/ProcesoHistoricos';
import { SeaceDataViewer } from '../proceso/SeaceDataViewer';
import type { Proceso, Seguimiento } from '../../types';
import {
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  ChevronsLeft,
  ChevronsRight,
  ExternalLink,
  Star,
  Eye,
  ArrowUpDown,
  Square,
  CheckSquare,
  Database,
  History,
  Download
} from 'lucide-react';
import { clsx } from 'clsx';

type SortKey = 'NOMENCLATURA' | 'ENTIDAD' | 'REGION' | 'VALOR' | 'FECHA_PUB' | 'EMPRESA_CORTA' | 'TIPO_SERVICIO';
type SortOrder = 'asc' | 'desc';

const ROW_HEIGHT_COLLAPSED = 72;
const ROW_HEIGHT_EXPANDED = 472;

type RowData = {
  procesos: Proceso[];
  expandedRow: number | null;
  procesosSeleccionados: number[];
  seguimiento: Seguimiento[];
  onToggleSelect: (id: number) => void;
  onToggleExpand: (id: number) => void;
  onViewDetail: (proceso: Proceso) => void;
};

export function ProcesosTable() {
  const procesosFiltrados = useStore(s => s.procesosFiltrados);
  const procesos = useStore(s => s.procesos);
  const procesosSeleccionados = useStore(s => s.procesosSeleccionados);
  const toggleProcesoSeleccionado = useStore(s => s.toggleProcesoSeleccionado);
  const seleccionarTodos = useStore(s => s.seleccionarTodos);
  const deseleccionarTodos = useStore(s => s.deseleccionarTodos);
  const setProcesoSeleccionado = useStore(s => s.setProcesoSeleccionado);
  const seguimiento = useStore(s => s.seguimiento);
  const agregarSeguimiento = useStore(s => s.agregarSeguimiento);

  const [sortKey, setSortKey] = useState<SortKey>('FECHA_PUB');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [expandedRow, setExpandedRow] = useState<number | null>(null);

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const procesosSorted = useMemo(() => {
    return [...procesosFiltrados].sort((a, b) => {
      let comparison = 0;

      switch (sortKey) {
        case 'VALOR':
          comparison = (a.VALOR || 0) - (b.VALOR || 0);
          break;
        case 'FECHA_PUB':
          comparison = new Date(a.FECHA_PUB).getTime() - new Date(b.FECHA_PUB).getTime();
          break;
        default:
          comparison = String(a[sortKey] || '').localeCompare(String(b[sortKey] || ''));
      }

      return sortOrder === 'asc' ? comparison : -comparison;
    });
  }, [procesosFiltrados, sortKey, sortOrder]);

  const totalPages = Math.ceil(procesosSorted.length / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const procesosPaginados = useMemo(() => {
    return procesosSorted.slice(startIndex, endIndex);
  }, [procesosSorted, startIndex, endIndex]);

  useEffect(() => {
    setCurrentPage(1);
  }, [procesosFiltrados.length]);

  useEffect(() => {
    setExpandedRow(null);
  }, [currentPage, pageSize, sortKey, sortOrder]);

  const handleSort = useCallback((key: SortKey) => {
    setSortKey(prevKey => {
      if (prevKey === key) {
        setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'));
        return prevKey;
      }
      setSortOrder('desc');
      return key;
    });
  }, []);

  const SortHeader = ({ column, label }: { column: SortKey; label: string }) => (
    <button
      className="flex items-center gap-1 hover:text-blue-600 transition-colors"
      onClick={() => handleSort(column)}
    >
      {label}
      <ArrowUpDown size={14} className={clsx(sortKey === column && 'text-blue-600')} />
    </button>
  );

  const todosSeleccionados = procesosSorted.length > 0 &&
    procesosSorted.every(p => procesosSeleccionados.includes(p.ID));

  const exportarCSV = () => {
    const headers = [
      'NOMENCLATURA',
      'ENTIDAD',
      'EMPRESA_CORTA',
      'REGION',
      'OBJETO',
      'TIPO_SERVICIO',
      'DESCRIPCION',
      'VALOR',
      'MONEDA',
      'FECHA_PUB',
      'ESTADO_FECHA',
      'VERSION',
      'URL'
    ];

    const rows = procesosSorted.map(p => [
      p.NOMENCLATURA || '',
      p.ENTIDAD || '',
      p.EMPRESA_CORTA || '',
      p.REGION || '',
      p.OBJETO || '',
      p.TIPO_SERVICIO || '',
      (p.DESCRIPCION || '').replace(/"/g, '""'),
      p.VALOR || 0,
      p.MONEDA || 'PEN',
      p.FECHA_PUB ? formatearFecha(p.FECHA_PUB) : '',
      p.ESTADO_FECHA || '',
      p.VERSION || '',
      p.URL || ''
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    const fecha = new Date().toISOString().split('T')[0];
    const filtroActivo = procesosSorted.length > 0 && procesosSorted[0].ESTADO_FECHA
      ? `_${procesosSorted[0].ESTADO_FECHA.replace(/ /g, '_')}`
      : '';
    link.href = url;
    link.download = `procesos_seace_${fecha}${filtroActivo}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleToggleSelect = useCallback((id: number) => {
    toggleProcesoSeleccionado(id);
  }, [toggleProcesoSeleccionado]);

  const handleToggleExpand = useCallback((id: number) => {
    setExpandedRow(prev => (prev === id ? null : id));
  }, []);

  const handleViewDetail = useCallback((proceso: Proceso) => {
    setProcesoSeleccionado(proceso);
  }, [setProcesoSeleccionado]);

  const rowProps = useMemo<RowData>(() => ({
    procesos: procesosPaginados,
    expandedRow,
    procesosSeleccionados,
    seguimiento,
    onToggleSelect: handleToggleSelect,
    onToggleExpand: handleToggleExpand,
    onViewDetail: handleViewDetail,
  }), [procesosPaginados, expandedRow, procesosSeleccionados, seguimiento, handleToggleSelect, handleToggleExpand, handleViewDetail]);

  const rowHeight = useCallback((index: number, props: RowData) => {
    const p = props.procesos[index];
    if (!p) return ROW_HEIGHT_COLLAPSED;
    return props.expandedRow === p.ID ? ROW_HEIGHT_EXPANDED : ROW_HEIGHT_COLLAPSED;
  }, []);

  if (procesosSorted.length === 0) {
    const sinDatos = procesos.length === 0;
    return (
      <Card className="text-center py-12">
        <div className="max-w-md mx-auto">
          {sinDatos ? (
            <>
              <p className="text-gray-700 font-medium mb-2">Todavía no se han importado procesos</p>
              <p className="text-sm text-gray-500">
                Usa la hoja de Google Sheets para pegar datos desde SEACE y luego ejecuta
                <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded mx-1">Procesar Import</span>
                desde el menú del Apps Script.
              </p>
            </>
          ) : (
            <>
              <p className="text-gray-700 font-medium mb-2">Ningún proceso coincide con los filtros actuales</p>
              <p className="text-sm text-gray-500">Prueba relajando los filtros o ampliando la búsqueda.</p>
            </>
          )}
        </div>
      </Card>
    );
  }

  const listHeight = Math.min(
    Math.max(
      procesosPaginados.reduce((acc, p) => acc + (expandedRow === p.ID ? ROW_HEIGHT_EXPANDED : ROW_HEIGHT_COLLAPSED), 0),
      ROW_HEIGHT_COLLAPSED
    ),
    Math.max(600, Math.floor((typeof window !== 'undefined' ? window.innerHeight : 900) - 320))
  );

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => todosSeleccionados ? deseleccionarTodos() : seleccionarTodos()}
            className="text-gray-500 hover:text-blue-600"
          >
            {todosSeleccionados ? <CheckSquare size={20} /> : <Square size={20} />}
          </button>
          <span className="text-sm text-gray-600">
            {procesosSeleccionados.length > 0
              ? `${procesosSeleccionados.length} de ${procesosSorted.length.toLocaleString('es-PE')} seleccionados`
              : `Mostrando ${startIndex + 1}–${Math.min(endIndex, procesosSorted.length).toLocaleString('es-PE')} de ${procesosSorted.length.toLocaleString('es-PE')} procesos`}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            icon={<Download size={14} />}
            onClick={exportarCSV}
            title={`Exportar ${procesosSorted.length.toLocaleString('es-PE')} procesos filtrados a CSV`}
          >
            Exportar {procesosSorted.length.toLocaleString('es-PE')} (CSV)
          </Button>

          {procesosSeleccionados.length > 0 && (
            <>
              <Button
                variant="outline"
                size="sm"
                icon={<Star size={14} />}
                onClick={async () => {
                  const nomenclaturasUnicas = new Set<string>();
                  for (const id of procesosSeleccionados) {
                    const proceso = procesos.find(p => p.ID === id);
                    if (proceso) nomenclaturasUnicas.add(proceso.NOMENCLATURA);
                  }
                  for (const nom of nomenclaturasUnicas) {
                    await agregarSeguimiento(nom, 'PENDIENTE', 'MEDIA', '');
                  }
                  deseleccionarTodos();
                }}
              >
                Agregar {procesosSeleccionados.length} a seguimiento
              </Button>
              <Button variant="outline" size="sm">Analizar con IA</Button>
            </>
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[1100px]">
          <div className="flex items-center bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
            <div className="w-10 px-2 py-3 flex-shrink-0"></div>
            <div className="min-w-[180px] flex-1 px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase">
              <SortHeader column="NOMENCLATURA" label="Proceso" />
            </div>
            <div className="min-w-[200px] flex-1 px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase">
              <SortHeader column="ENTIDAD" label="Entidad" />
            </div>
            <div className="min-w-[90px] flex-shrink-0 px-2 py-3 text-center text-xs font-medium text-gray-500 uppercase">
              <SortHeader column="EMPRESA_CORTA" label="Empresa" />
            </div>
            <div className="min-w-[70px] flex-shrink-0 px-2 py-3 text-center text-xs font-medium text-gray-500 uppercase">
              <SortHeader column="REGION" label="Región" />
            </div>
            <div className="min-w-[80px] flex-shrink-0 px-2 py-3 text-center text-xs font-medium text-gray-500 uppercase">
              <SortHeader column="TIPO_SERVICIO" label="Tipo" />
            </div>
            <div className="min-w-[100px] flex-shrink-0 px-2 py-3 text-right text-xs font-medium text-gray-500 uppercase">
              <SortHeader column="VALOR" label="Valor" />
            </div>
            <div className="min-w-[80px] flex-shrink-0 px-2 py-3 text-center text-xs font-medium text-gray-500 uppercase">
              <SortHeader column="FECHA_PUB" label="Fecha" />
            </div>
            <div className="min-w-[85px] flex-shrink-0 px-2 py-3 text-center text-xs font-medium text-gray-500 uppercase">
              Antigüedad
            </div>
            <div className="min-w-[70px] flex-shrink-0 px-2 py-3 text-center text-xs font-medium text-gray-500 uppercase">
              Estado
            </div>
            <div className="w-8 flex-shrink-0 px-2 py-3"></div>
          </div>

          <List
            rowComponent={ProcesoRow}
            rowCount={procesosPaginados.length}
            rowHeight={rowHeight}
            rowProps={rowProps}
            style={{ height: listHeight, width: '100%' }}
            overscanCount={3}
          />
        </div>
      </div>

      {totalPages > 1 && (
        <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">Filas por página:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="text-sm border border-gray-300 rounded px-2 py-1 bg-white"
            >
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={200}>200</option>
            </select>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
              className="p-1.5 rounded hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed"
              title="Primera página"
            >
              <ChevronsLeft size={18} />
            </button>
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-1.5 rounded hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed"
              title="Página anterior"
            >
              <ChevronLeft size={18} />
            </button>

            <span className="px-3 text-sm text-gray-700">
              Página <strong>{currentPage}</strong> de <strong>{totalPages}</strong>
            </span>

            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="p-1.5 rounded hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed"
              title="Página siguiente"
            >
              <ChevronRight size={18} />
            </button>
            <button
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages}
              className="p-1.5 rounded hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed"
              title="Última página"
            >
              <ChevronsRight size={18} />
            </button>
          </div>

          <div className="text-sm text-gray-600">
            {startIndex + 1}-{Math.min(endIndex, procesosSorted.length)} de {procesosSorted.length} procesos
          </div>
        </div>
      )}
    </div>
  );
}

const ProcesoRowInner = memo(function ProcesoRowInner({
  index,
  style,
  procesos,
  expandedRow,
  procesosSeleccionados,
  seguimiento,
  onToggleSelect,
  onToggleExpand,
  onViewDetail,
}: RowComponentProps<RowData>) {
  const proceso = procesos[index];
  if (!proceso) return <div style={style} />;
  const isExpanded = expandedRow === proceso.ID;
  const isSelected = procesosSeleccionados.includes(proceso.ID);
  const seguimientoStatus = seguimiento.find(s => s.NOMENCLATURA === proceso.NOMENCLATURA);

  return (
    <div style={style} className="border-b border-gray-100">
      <div
        className={clsx(
          'flex items-start hover:bg-gray-50 transition-colors',
          isSelected && 'bg-blue-50'
        )}
        style={{ height: ROW_HEIGHT_COLLAPSED }}
      >
        <div className="w-10 px-2 py-3 flex-shrink-0">
          <button
            onClick={() => onToggleSelect(proceso.ID)}
            className={clsx(
              'transition-colors',
              isSelected ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600'
            )}
          >
            {isSelected ? <CheckSquare size={18} /> : <Square size={18} />}
          </button>
        </div>
        <div className="min-w-[180px] flex-1 px-2 py-3">
          <div className="flex items-start gap-1">
            <button
              onClick={() => onToggleExpand(proceso.ID)}
              className="text-gray-400 hover:text-gray-600 mt-0.5 flex-shrink-0"
            >
              {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
            <div className="min-w-0">
              <p className="font-medium text-gray-900 text-sm">
                {proceso.NOMENCLATURA}
              </p>
              <p className="text-xs text-gray-500 line-clamp-1" title={proceso.DESCRIPCION || ''}>
                {proceso.DESCRIPCION}
              </p>
            </div>
          </div>
        </div>
        <div className="min-w-[200px] flex-1 px-2 py-3">
          <p className="text-sm text-gray-900 line-clamp-2" title={proceso.ENTIDAD}>
            {proceso.ENTIDAD}
          </p>
        </div>
        <div className="min-w-[90px] flex-shrink-0 px-2 py-3 text-center">
          <EmpresaCortaBadge empresa={proceso.EMPRESA_CORTA} />
        </div>
        <div className="min-w-[70px] flex-shrink-0 px-2 py-3 text-center">
          <Badge variant="default" className="text-xs">{proceso.REGION}</Badge>
        </div>
        <div className="min-w-[80px] flex-shrink-0 px-2 py-3 text-center">
          <TipoServicioBadge tipo={proceso.TIPO_SERVICIO} />
        </div>
        <div className="min-w-[100px] flex-shrink-0 px-2 py-3 text-right">
          <p className="text-sm font-medium text-gray-900 whitespace-nowrap">
            {formatearMoneda(proceso.VALOR, proceso.MONEDA)}
          </p>
        </div>
        <div className="min-w-[80px] flex-shrink-0 px-2 py-3 text-center">
          <p className="text-xs text-gray-600 whitespace-nowrap">
            {formatearFecha(proceso.FECHA_PUB)}
          </p>
        </div>
        <div className="min-w-[85px] flex-shrink-0 px-2 py-3 text-center">
          <EstadoFechaBadge estado={proceso.ESTADO_FECHA} />
        </div>
        <div className="min-w-[70px] flex-shrink-0 px-2 py-3 text-center">
          <div className="flex items-center gap-1 justify-center">
            {seguimientoStatus ? (
              <EstadoBadge estado={seguimientoStatus.ESTADO_INTERES} />
            ) : (
              <span className="text-gray-400 text-xs">-</span>
            )}
            <HistoricosIndicador proceso={proceso} />
          </div>
        </div>
        <div className="w-8 flex-shrink-0 px-2 py-3">
          <button
            onClick={() => onViewDetail(proceso)}
            className="text-gray-400 hover:text-blue-600"
          >
            <Eye size={16} />
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="bg-gray-50 px-4 py-4" style={{ height: ROW_HEIGHT_EXPANDED - ROW_HEIGHT_COLLAPSED, overflow: 'auto' }}>
          <ProcesoExpandido proceso={proceso} />
        </div>
      )}
    </div>
  );
});

const ProcesoRow = (props: RowComponentProps<RowData>) => <ProcesoRowInner {...props} />;

type ExpandedTab = 'info' | 'historicos' | 'ocds';

function ProcesoExpandido({ proceso }: { proceso: Proceso }) {
  const agregarSeguimiento = useStore(s => s.agregarSeguimiento);
  const eliminarSeguimiento = useStore(s => s.eliminarSeguimiento);
  const seguimiento = useStore(s => s.seguimiento);
  const [eliminando, setEliminando] = useState(false);
  const seguimientoActual = (seguimiento || []).find(s => s.NOMENCLATURA === proceso.NOMENCLATURA);
  const [tabActivo, setTabActivo] = useState<ExpandedTab>('info');

  const tabs: { id: ExpandedTab; label: string; icon: React.ReactNode }[] = [
    { id: 'info', label: 'Información', icon: <Eye size={14} /> },
    { id: 'historicos', label: 'Históricos', icon: <History size={14} /> },
    { id: 'ocds', label: 'Datos OCDS', icon: <Database size={14} /> },
  ];

  return (
    <div className="animate-fadeIn">
      <div className="flex border-b border-gray-200 mb-4">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setTabActivo(tab.id)}
            className={clsx(
              'flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors',
              tabActivo === tab.id
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            )}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {tabActivo === 'info' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <h4 className="font-medium text-gray-900 mb-2">Descripción completa</h4>
            <p className="text-sm text-gray-600">{proceso.DESCRIPCION}</p>

            <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-500">Versión SEACE:</span>
                <span className="ml-2 font-medium">{proceso.VERSION}</span>
              </div>
              {proceso.REINICIADO && (
                <div>
                  <span className="text-gray-500">Reiniciado desde:</span>
                  <span className="ml-2 font-medium">{proceso.REINICIADO}</span>
                </div>
              )}
            </div>
          </div>

          <div>
            <h4 className="font-medium text-gray-900 mb-2">Acciones</h4>
            <div className="flex flex-wrap gap-2">
              {!seguimientoActual && (
                <Button
                  variant="primary"
                  size="sm"
                  icon={<Star size={14} />}
                  onClick={() => agregarSeguimiento(proceso.NOMENCLATURA, 'PENDIENTE', 'MEDIA', '')}
                >
                  Agregar a seguimiento
                </Button>
              )}
              {proceso.URL && (
                <Button
                  variant="outline"
                  size="sm"
                  icon={<ExternalLink size={14} />}
                  onClick={() => window.open(proceso.URL!, '_blank')}
                >
                  Ver en SEACE
                </Button>
              )}
              <Button variant="outline" size="sm">
                Analizar con IA
              </Button>
            </div>

            {seguimientoActual && (
              <div className="mt-4 p-3 bg-white rounded-lg border border-gray-200">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium text-gray-700">En seguimiento</p>
                  <button
                    onClick={async () => {
                      if (confirm('¿Eliminar este proceso del seguimiento?')) {
                        setEliminando(true);
                        await eliminarSeguimiento(proceso.NOMENCLATURA);
                        setEliminando(false);
                      }
                    }}
                    disabled={eliminando}
                    className="text-xs text-red-500 hover:text-red-700 hover:bg-red-50 px-2 py-1 rounded disabled:opacity-50"
                  >
                    {eliminando ? 'Eliminando...' : 'Quitar'}
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <EstadoBadge estado={seguimientoActual.ESTADO_INTERES} />
                  <PrioridadBadge prioridad={seguimientoActual.PRIORIDAD} />
                </div>
                {seguimientoActual.NOTAS && (
                  <p className="text-sm text-gray-600 mt-2">{seguimientoActual.NOTAS}</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {tabActivo === 'historicos' && (
        <ProcesoHistoricos proceso={proceso} />
      )}

      {tabActivo === 'ocds' && (
        <SeaceDataViewer nomenclatura={proceso.NOMENCLATURA} proceso={proceso} />
      )}
    </div>
  );
}
