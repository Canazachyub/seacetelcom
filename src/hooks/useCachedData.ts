/**
 * Hooks con Caché para datos de API - v3.1
 * Proporciona acceso a datos con caché automático
 * Los componentes pueden usar estos hooks en lugar de llamar directamente al store
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { cachedFetch, apiCache, cacheInvalidators } from '../services/cache';
import * as api from '../services/api';
import type {
  Proceso,
  Seguimiento,
  EntidadUnica,
  Estadisticas,
  RegionesConProcesos,
  FiltroEntidad,
  FiltroPalabra,
  GrupoHistorico,
  DatosSeace,
} from '../types';
import type { DatosProcesoOCDS } from '../services/api';

// ==================== TIPOS ====================

interface UseCachedDataResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: (forceRefresh?: boolean) => Promise<void>;
  invalidate: () => void;
}

interface UseCachedDataOptions {
  /** Cargar automáticamente al montar */
  autoLoad?: boolean;
  /** Forzar recarga aunque haya caché */
  forceRefresh?: boolean;
  /** Dependencias que disparan recarga */
  deps?: unknown[];
}

// ==================== HOOK GENÉRICO ====================

function useCachedData<T>(
  cacheKey: string,
  fetchFn: () => Promise<T>,
  params?: Record<string, string>,
  options: UseCachedDataOptions = {}
): UseCachedDataResult<T> {
  const { autoLoad = true, forceRefresh = false, deps = [] } = options;

  const [data, setData] = useState<T | null>(() => {
    // Intentar obtener de caché al inicializar
    return apiCache.get<T>(cacheKey, params);
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mountedRef = useRef(true);

  const fetchData = useCallback(async (force: boolean = false) => {
    setLoading(true);
    setError(null);

    try {
      const result = await cachedFetch<T>(
        cacheKey,
        params,
        fetchFn,
        { forceRefresh: force || forceRefresh }
      );

      if (mountedRef.current) {
        setData(result);
      }
    } catch (err) {
      if (mountedRef.current) {
        const errorMsg = err instanceof Error ? err.message : 'Error desconocido';
        setError(errorMsg);
        console.error(`Error en ${cacheKey}:`, err);
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [cacheKey, params, fetchFn, forceRefresh]);

  const refetch = useCallback(async (force: boolean = true) => {
    await fetchData(force);
  }, [fetchData]);

  const invalidate = useCallback(() => {
    apiCache.invalidate(cacheKey, params);
    setData(null);
  }, [cacheKey, params]);

  // Cargar al montar si autoLoad está habilitado
  useEffect(() => {
    mountedRef.current = true;

    if (autoLoad) {
      // Si ya tenemos datos en caché, no mostrar loading
      const cached = apiCache.get<T>(cacheKey, params);
      if (cached) {
        setData(cached);
        // Opcionalmente revalidar en background
        if (forceRefresh) {
          fetchData(true);
        }
      } else {
        fetchData(false);
      }
    }

    return () => {
      mountedRef.current = false;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoLoad, ...deps]);

  return { data, loading, error, refetch, invalidate };
}

// ==================== HOOKS ESPECÍFICOS ====================

/**
 * Hook para obtener procesos con caché
 */
export function useCachedProcesos(options?: UseCachedDataOptions) {
  return useCachedData<{ procesos: Proceso[] }>(
    'getProcesos',
    () => api.getProcesos(),
    undefined,
    options
  );
}

/**
 * Hook para obtener estadísticas con caché
 */
export function useCachedEstadisticas(options?: UseCachedDataOptions) {
  return useCachedData<Estadisticas>(
    'getEstadisticas',
    () => api.getEstadisticas(),
    undefined,
    options
  );
}

/**
 * Hook para obtener regiones con caché
 */
export function useCachedRegiones(options?: UseCachedDataOptions) {
  return useCachedData<RegionesConProcesos>(
    'getRegiones',
    () => api.getRegionesConProcesos(),
    undefined,
    options
  );
}

/**
 * Hook para obtener seguimiento con caché
 */
export function useCachedSeguimiento(options?: UseCachedDataOptions) {
  const result = useCachedData<Seguimiento[]>(
    'getSeguimiento',
    () => api.getSeguimiento(),
    undefined,
    options
  );

  // Función para invalidar al modificar seguimiento
  const invalidateOnChange = useCallback(() => {
    cacheInvalidators.onSeguimientoChange();
    result.refetch(true);
  }, [result]);

  return { ...result, invalidateOnChange };
}

/**
 * Hook para obtener entidades únicas con caché
 */
export function useCachedEntidades(options?: UseCachedDataOptions) {
  return useCachedData<EntidadUnica[]>(
    'getEntidadesUnicas',
    () => api.getEntidadesUnicas(),
    undefined,
    options
  );
}

/**
 * Hook para obtener filtros de entidades con caché
 */
export function useCachedFiltrosEntidades(options?: UseCachedDataOptions) {
  return useCachedData<FiltroEntidad[]>(
    'getFiltrosEntidades',
    () => api.getFiltrosEntidades(),
    undefined,
    options
  );
}

/**
 * Hook para obtener filtros de palabras con caché
 */
export function useCachedFiltrosPalabras(options?: UseCachedDataOptions) {
  return useCachedData<FiltroPalabra[]>(
    'getFiltrosPalabras',
    () => api.getFiltrosPalabras(),
    undefined,
    options
  );
}

/**
 * Hook para obtener datos OCDS de un proceso
 */
export function useCachedProcesoOCDS(
  nomenclatura: string | null,
  options?: UseCachedDataOptions
) {
  return useCachedData<DatosProcesoOCDS | null>(
    'getProcesoOCDS',
    () => nomenclatura ? api.getProcesoOCDS(nomenclatura) : Promise.resolve(null),
    nomenclatura ? { nomenclatura } : undefined,
    { ...options, autoLoad: !!nomenclatura, deps: [nomenclatura] }
  );
}

/**
 * Hook para obtener datos SEACE scrapeados
 */
export function useCachedDatosSeace(
  nomenclatura: string | null,
  options?: UseCachedDataOptions
) {
  return useCachedData<DatosSeace | null>(
    'getDatosSeace',
    () => nomenclatura ? api.getDatosSeace(nomenclatura) : Promise.resolve(null),
    nomenclatura ? { nomenclatura } : undefined,
    { ...options, autoLoad: !!nomenclatura, deps: [nomenclatura] }
  );
}

/**
 * Hook para obtener grupo histórico por nomenclatura
 */
export function useCachedGrupoHistorico(
  nomenclatura: string | null,
  options?: UseCachedDataOptions
) {
  return useCachedData<GrupoHistorico | null>(
    'getGrupoByNomenclatura',
    () => nomenclatura ? api.getGrupoByNomenclatura(nomenclatura) : Promise.resolve(null),
    nomenclatura ? { nomenclatura } : undefined,
    { ...options, autoLoad: !!nomenclatura, deps: [nomenclatura] }
  );
}

// ==================== HOOK DE CARGA INICIAL OPTIMIZADA ====================

interface InitialLoadResult {
  loading: boolean;
  error: string | null;
  progress: { completed: number; total: number };
  reload: () => Promise<void>;
}

/**
 * Hook para carga inicial optimizada con caché
 * Carga solo lo que no está en caché
 */
export function useOptimizedInitialLoad(): InitialLoadResult {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState({ completed: 0, total: 5 });

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    setProgress({ completed: 0, total: 5 });

    const tasks = [
      { key: 'getProcesos', fn: () => api.getProcesos() },
      { key: 'getEstadisticas', fn: () => api.getEstadisticas() },
      { key: 'getRegiones', fn: () => api.getRegionesConProcesos() },
      { key: 'getSeguimiento', fn: () => api.getSeguimiento() },
      { key: 'getEntidadesUnicas', fn: () => api.getEntidadesUnicas() },
    ];

    let completed = 0;
    const errors: string[] = [];

    // Filtrar tareas que ya están en caché
    const pendingTasks = tasks.filter(task => !apiCache.get(task.key));

    if (pendingTasks.length === 0) {
      console.log('✨ Todos los datos ya están en caché');
      setProgress({ completed: tasks.length, total: tasks.length });
      setLoading(false);
      return;
    }

    console.log(`🚀 Cargando ${pendingTasks.length} de ${tasks.length} recursos...`);

    // Cargar en paralelo los que faltan
    await Promise.all(
      pendingTasks.map(async (task) => {
        try {
          await cachedFetch(task.key, undefined, task.fn as () => Promise<unknown>);
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Error';
          errors.push(`${task.key}: ${msg}`);
        } finally {
          completed++;
          setProgress({ completed: tasks.length - pendingTasks.length + completed, total: tasks.length });
        }
      })
    );

    if (errors.length > 0) {
      setError(`Errores en: ${errors.join(', ')}`);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  return { loading, error, progress, reload: loadData };
}

// ==================== UTILIDADES ====================

/**
 * Limpia toda la caché
 */
export function clearAllCache(): void {
  cacheInvalidators.clearAll();
}

/**
 * Obtiene estadísticas de la caché
 */
export function getCacheStats() {
  return apiCache.getStats();
}
