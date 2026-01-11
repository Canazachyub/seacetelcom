/**
 * Indicador de Caché - v3.1
 * Componente opcional para mostrar estado del caché y permitir limpiarlo
 * Solo visible en modo desarrollo o si el usuario lo habilita
 */

import { useState, useEffect } from 'react';
import { Database, RefreshCw, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { apiCache, cacheInvalidators } from '../../services/cache';
import { clsx } from 'clsx';

interface CacheStats {
  entries: number;
  actions: string[];
  size: string;
}

export function CacheIndicator() {
  const [stats, setStats] = useState<CacheStats>({ entries: 0, actions: [], size: '0 KB' });
  const [expanded, setExpanded] = useState(false);
  const [clearing, setClearing] = useState(false);

  // Actualizar stats cada 5 segundos
  useEffect(() => {
    const updateStats = () => {
      setStats(apiCache.getStats());
    };

    updateStats();
    const interval = setInterval(updateStats, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleClear = async () => {
    setClearing(true);
    cacheInvalidators.clearAll();
    setStats(apiCache.getStats());
    // Pequeña pausa visual
    await new Promise(r => setTimeout(r, 500));
    setClearing(false);
  };

  // No mostrar si no hay entradas
  if (stats.entries === 0 && !expanded) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <div className="bg-white rounded-lg shadow-lg border border-gray-200 overflow-hidden max-w-xs">
        {/* Header */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full px-3 py-2 flex items-center justify-between bg-gray-50 hover:bg-gray-100 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Database size={16} className="text-blue-600" />
            <span className="text-sm font-medium text-gray-700">
              Caché: {stats.entries} entradas
            </span>
          </div>
          {expanded ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
        </button>

        {/* Contenido expandido */}
        {expanded && (
          <div className="p-3 space-y-3">
            {/* Stats */}
            <div className="text-xs text-gray-600 space-y-1">
              <p><strong>Tamaño:</strong> {stats.size}</p>
              <p><strong>Acciones cacheadas:</strong></p>
              <div className="flex flex-wrap gap-1 mt-1">
                {stats.actions.map(action => (
                  <span
                    key={action}
                    className="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-[10px]"
                  >
                    {action}
                  </span>
                ))}
              </div>
            </div>

            {/* Botones */}
            <div className="flex gap-2">
              <button
                onClick={() => window.location.reload()}
                className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs bg-gray-100 hover:bg-gray-200 rounded transition-colors"
              >
                <RefreshCw size={12} />
                Recargar
              </button>
              <button
                onClick={handleClear}
                disabled={clearing}
                className={clsx(
                  'flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs rounded transition-colors',
                  clearing
                    ? 'bg-gray-100 text-gray-400'
                    : 'bg-red-100 hover:bg-red-200 text-red-700'
                )}
              >
                <Trash2 size={12} />
                {clearing ? 'Limpiando...' : 'Limpiar caché'}
              </button>
            </div>

            {/* Nota */}
            <p className="text-[10px] text-gray-400">
              El caché mejora la velocidad de carga. Los datos se actualizan automáticamente.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Versión compacta del indicador (solo para desarrollo)
 */
export function CacheIndicatorCompact() {
  const [stats, setStats] = useState<CacheStats>({ entries: 0, actions: [], size: '0 KB' });

  useEffect(() => {
    const updateStats = () => setStats(apiCache.getStats());
    updateStats();
    const interval = setInterval(updateStats, 3000);
    return () => clearInterval(interval);
  }, []);

  if (stats.entries === 0) return null;

  return (
    <div
      className="fixed bottom-4 right-4 z-50 px-2 py-1 bg-blue-600 text-white text-xs rounded-full shadow-lg cursor-pointer hover:bg-blue-700"
      onClick={() => cacheInvalidators.clearAll()}
      title="Click para limpiar caché"
    >
      <Database size={12} className="inline mr-1" />
      {stats.entries} en caché ({stats.size})
    </div>
  );
}
