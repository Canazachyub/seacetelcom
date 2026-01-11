import { memo, useCallback, useState } from 'react';
import {
  ComposableMap,
  Geographies,
  Geography,
  ZoomableGroup,
  Marker
} from 'react-simple-maps';
import { useStore } from '../../store/useStore';
import { clsx } from 'clsx';
import { formatearMoneda } from '../../utils/constants';

// Importar GeoJSON de Perú
import peruGeoData from '../../data/peru-departments.json';

interface PeruMapProps {
  className?: string;
}

interface TooltipData {
  name: string;
  count: number;
  valor: number;
  x: number;
  y: number;
}

// Coordenadas de las capitales de departamento para mostrar etiquetas
const DEPARTMENT_CENTERS: Record<string, [number, number]> = {
  'AMAZONAS': [-78.0, -5.5],
  'ANCASH': [-77.5, -9.1],
  'APURIMAC': [-72.9, -14.0],
  'AREQUIPA': [-72.5, -15.5],
  'AYACUCHO': [-74.0, -13.5],
  'CAJAMARCA': [-78.5, -6.8],
  'CALLAO': [-77.1, -12.0],
  'CUSCO': [-72.0, -13.5],
  'HUANCAVELICA': [-75.0, -12.8],
  'HUANUCO': [-76.2, -9.9],
  'ICA': [-75.7, -14.1],
  'JUNIN': [-75.0, -11.5],
  'LA LIBERTAD': [-78.8, -8.1],
  'LAMBAYEQUE': [-79.8, -6.3],
  'LIMA': [-76.6, -11.8],
  'LORETO': [-74.5, -4.5],
  'MADRE DE DIOS': [-70.0, -11.8],
  'MOQUEGUA': [-70.9, -17.0],
  'PASCO': [-75.6, -10.4],
  'PIURA': [-80.3, -5.2],
  'PUNO': [-70.0, -15.5],
  'SAN MARTIN': [-76.8, -7.0],
  'TACNA': [-70.2, -17.6],
  'TUMBES': [-80.4, -3.9],
  'UCAYALI': [-74.0, -9.5],
};

// Mapeo de nombres del GeoJSON a nombres usados en la app
const NAME_MAPPING: Record<string, string> = {
  'AMAZONAS': 'AMAZONAS',
  'ANCASH': 'ANCASH',
  'APURIMAC': 'APURIMAC',
  'AREQUIPA': 'AREQUIPA',
  'AYACUCHO': 'AYACUCHO',
  'CAJAMARCA': 'CAJAMARCA',
  'CALLAO': 'CALLAO',
  'CUSCO': 'CUSCO',
  'HUANCAVELICA': 'HUANCAVELICA',
  'HUANUCO': 'HUANUCO',
  'ICA': 'ICA',
  'JUNIN': 'JUNIN',
  'LA LIBERTAD': 'LA LIBERTAD',
  'LAMBAYEQUE': 'LAMBAYEQUE',
  'LIMA': 'LIMA',
  'LORETO': 'LORETO',
  'MADRE DE DIOS': 'MADRE DE DIOS',
  'MOQUEGUA': 'MOQUEGUA',
  'PASCO': 'PASCO',
  'PIURA': 'PIURA',
  'PUNO': 'PUNO',
  'SAN MARTIN': 'SAN MARTIN',
  'TACNA': 'TACNA',
  'TUMBES': 'TUMBES',
  'UCAYALI': 'UCAYALI',
};

// Paleta de colores mejorada - gradiente de verde a naranja
const COLOR_PALETTE = {
  empty: '#f1f5f9',        // Gris muy claro
  low: '#86efac',          // Verde claro
  medium: '#fcd34d',       // Amarillo
  high: '#fb923c',         // Naranja
  veryHigh: '#ef4444',     // Rojo
  selected: '#7c3aed',     // Violeta
  hover: '#a78bfa',        // Violeta claro
  stroke: '#475569',       // Gris oscuro para bordes
  strokeHover: '#1e293b',  // Más oscuro en hover
};

function PeruMapComponent({ className }: PeruMapProps) {
  const { regionesData, filtros, setFiltros } = useStore();
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);

  const handleRegionClick = useCallback((regionName: string) => {
    const newRegiones = filtros.regiones.includes(regionName)
      ? filtros.regiones.filter(r => r !== regionName)
      : [...filtros.regiones, regionName];
    setFiltros({ regiones: newRegiones });
  }, [filtros.regiones, setFiltros]);

  const getRegionCount = (regionName: string): number => {
    return regionesData[regionName]?.count || 0;
  };

  const getRegionValor = (regionName: string): number => {
    return regionesData[regionName]?.valor || 0;
  };

  const getColorByCount = (count: number, isSelected: boolean): string => {
    if (isSelected) return COLOR_PALETTE.selected;
    if (count === 0) return COLOR_PALETTE.empty;
    if (count <= 3) return COLOR_PALETTE.low;
    if (count <= 10) return COLOR_PALETTE.medium;
    if (count <= 20) return COLOR_PALETTE.high;
    return COLOR_PALETTE.veryHigh;
  };

  const handleMouseEnter = (
    regionName: string,
    event: React.MouseEvent<SVGPathElement>
  ) => {
    const count = getRegionCount(regionName);
    const valor = getRegionValor(regionName);
    setTooltip({
      name: regionName,
      count,
      valor,
      x: event.clientX,
      y: event.clientY,
    });
  };

  const handleMouseMove = (event: React.MouseEvent<SVGPathElement>) => {
    if (tooltip) {
      setTooltip(prev => prev ? { ...prev, x: event.clientX, y: event.clientY } : null);
    }
  };

  const handleMouseLeave = () => {
    setTooltip(null);
  };

  return (
    <div className={clsx('relative', className)}>
      <ComposableMap
        projection="geoMercator"
        projectionConfig={{
          scale: 1800,
          center: [-75.5, -9.5]
        }}
        style={{ width: '100%', height: '100%' }}
      >
        <ZoomableGroup center={[-75.5, -9.5]} zoom={1}>
          <Geographies geography={peruGeoData}>
            {({ geographies }) =>
              geographies.map((geo) => {
                const rawName = geo.properties.NOMBDEP || geo.properties.name || '';
                const regionName = NAME_MAPPING[rawName.toUpperCase()] || rawName.toUpperCase();
                const count = getRegionCount(regionName);
                const isSelected = filtros.regiones.includes(regionName);

                return (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    onClick={() => handleRegionClick(regionName)}
                    onMouseEnter={(e) => handleMouseEnter(regionName, e)}
                    onMouseMove={handleMouseMove}
                    onMouseLeave={handleMouseLeave}
                    style={{
                      default: {
                        fill: getColorByCount(count, isSelected),
                        stroke: COLOR_PALETTE.stroke,
                        strokeWidth: 0.5,
                        outline: 'none',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                      },
                      hover: {
                        fill: isSelected ? COLOR_PALETTE.selected : COLOR_PALETTE.hover,
                        stroke: COLOR_PALETTE.strokeHover,
                        strokeWidth: 1.5,
                        outline: 'none',
                        cursor: 'pointer',
                      },
                      pressed: {
                        fill: COLOR_PALETTE.selected,
                        stroke: COLOR_PALETTE.strokeHover,
                        strokeWidth: 1.5,
                        outline: 'none',
                      },
                    }}
                  />
                );
              })
            }
          </Geographies>

          {/* Marcadores con conteo */}
          {Object.entries(DEPARTMENT_CENTERS).map(([name, coords]) => {
            const count = getRegionCount(name);
            if (count === 0) return null;

            const isSelected = filtros.regiones.includes(name);
            const markerColor = isSelected ? '#7c3aed' : '#1e293b';

            return (
              <Marker key={name} coordinates={coords}>
                <circle
                  r={count > 15 ? 14 : count > 5 ? 11 : 9}
                  fill="white"
                  stroke={markerColor}
                  strokeWidth={2}
                  style={{ cursor: 'pointer', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))' }}
                  onClick={() => handleRegionClick(name)}
                />
                <text
                  textAnchor="middle"
                  y={4}
                  style={{
                    fontFamily: 'system-ui',
                    fontSize: count > 99 ? '8px' : '10px',
                    fill: markerColor,
                    fontWeight: 'bold',
                    pointerEvents: 'none',
                  }}
                >
                  {count}
                </text>
              </Marker>
            );
          })}
        </ZoomableGroup>
      </ComposableMap>

      {/* Tooltip flotante */}
      {tooltip && (
        <div
          className="fixed z-50 pointer-events-none"
          style={{
            left: tooltip.x + 15,
            top: tooltip.y - 10,
          }}
        >
          <div className="bg-slate-800 text-white px-3 py-2 rounded-lg shadow-xl text-sm">
            <p className="font-bold text-base">{tooltip.name}</p>
            <div className="mt-1 space-y-0.5 text-slate-200">
              <p>
                <span className="text-slate-400">Procesos:</span>{' '}
                <span className="font-semibold text-white">{tooltip.count}</span>
              </p>
              {tooltip.valor > 0 && (
                <p>
                  <span className="text-slate-400">Valor:</span>{' '}
                  <span className="font-semibold text-emerald-400">
                    {formatearMoneda(tooltip.valor)}
                  </span>
                </p>
              )}
            </div>
            {/* Flecha del tooltip */}
            <div className="absolute -left-2 top-3 w-0 h-0 border-t-8 border-b-8 border-r-8 border-transparent border-r-slate-800" />
          </div>
        </div>
      )}

      {/* Leyenda mejorada */}
      <div className="absolute bottom-4 left-4 bg-white/95 backdrop-blur-sm p-4 rounded-xl shadow-lg border border-slate-200">
        <p className="font-bold text-slate-700 mb-3 text-sm">Procesos por región</p>
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-md border border-slate-300" style={{ backgroundColor: COLOR_PALETTE.empty }}></div>
            <span className="text-slate-600 text-xs">Sin procesos</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-md border border-slate-300" style={{ backgroundColor: COLOR_PALETTE.low }}></div>
            <span className="text-slate-600 text-xs">1 - 3</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-md border border-slate-300" style={{ backgroundColor: COLOR_PALETTE.medium }}></div>
            <span className="text-slate-600 text-xs">4 - 10</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-md border border-slate-300" style={{ backgroundColor: COLOR_PALETTE.high }}></div>
            <span className="text-slate-600 text-xs">11 - 20</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-md border border-slate-300" style={{ backgroundColor: COLOR_PALETTE.veryHigh }}></div>
            <span className="text-slate-600 text-xs">20+</span>
          </div>
        </div>
      </div>

      {/* Regiones seleccionadas */}
      {filtros.regiones.length > 0 && (
        <div className="absolute top-4 right-4 bg-violet-600 text-white px-4 py-2 rounded-xl shadow-lg text-sm flex items-center gap-2">
          <span className="font-semibold">{filtros.regiones.length} región(es)</span>
          <span className="text-violet-200">|</span>
          <span className="text-violet-100 max-w-[150px] truncate">
            {filtros.regiones.join(', ')}
          </span>
          <button
            onClick={() => setFiltros({ regiones: [] })}
            className="ml-1 hover:bg-violet-500 rounded-full p-1 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Instrucciones */}
      <div className="absolute top-4 left-4 bg-white/90 backdrop-blur-sm px-3 py-1.5 rounded-lg shadow text-xs text-slate-500">
        Click en una región para filtrar
      </div>
    </div>
  );
}

export const PeruMap = memo(PeruMapComponent);

// Versión compacta del mapa para el sidebar
export function PeruMapMini({ className }: { className?: string }) {
  const { filtros, setFiltros, regionesData } = useStore();

  const allRegions = Object.keys(DEPARTMENT_CENTERS);

  const toggleRegion = (region: string) => {
    const newRegiones = filtros.regiones.includes(region)
      ? filtros.regiones.filter(r => r !== region)
      : [...filtros.regiones, region];
    setFiltros({ regiones: newRegiones });
  };

  const getColorClass = (region: string) => {
    const data = regionesData[region];
    const count = data?.count || 0;
    const isSelected = filtros.regiones.includes(region);

    if (isSelected) return 'bg-violet-600 text-white border-violet-600';
    if (count === 0) return 'bg-slate-100 text-slate-400 border-slate-200';
    if (count <= 3) return 'bg-green-100 text-green-700 border-green-300 hover:bg-green-200';
    if (count <= 10) return 'bg-yellow-100 text-yellow-700 border-yellow-300 hover:bg-yellow-200';
    if (count <= 20) return 'bg-orange-100 text-orange-700 border-orange-300 hover:bg-orange-200';
    return 'bg-red-100 text-red-700 border-red-300 hover:bg-red-200';
  };

  return (
    <div className={clsx('grid grid-cols-5 gap-1', className)}>
      {allRegions.map(region => {
        const data = regionesData[region];

        return (
          <button
            key={region}
            onClick={() => toggleRegion(region)}
            className={clsx(
              'px-1 py-0.5 text-[10px] rounded border transition-colors font-medium',
              getColorClass(region)
            )}
            title={`${region}: ${data?.count || 0} procesos`}
          >
            {region.substring(0, 3)}
          </button>
        );
      })}
    </div>
  );
}
