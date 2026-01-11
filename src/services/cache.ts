/**
 * Sistema de Caché para API - v3.1
 * Mejora el rendimiento almacenando respuestas en memoria y localStorage
 * No modifica las funciones de API existentes, solo las envuelve
 */

// ==================== CONFIGURACIÓN ====================

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

interface CacheConfig {
  // TTL por defecto en milisegundos (5 minutos)
  defaultTTL: number;
  // TTL específicos por acción
  ttlByAction: Record<string, number>;
  // Usar localStorage para persistencia
  persist: boolean;
  // Prefijo para keys en localStorage
  storagePrefix: string;
}

const DEFAULT_CONFIG: CacheConfig = {
  defaultTTL: 5 * 60 * 1000, // 5 minutos
  ttlByAction: {
    // Datos que cambian poco - caché largo (30 min)
    'getRegiones': 30 * 60 * 1000,
    'getEntidadesUnicas': 30 * 60 * 1000,
    'getFiltrosEntidades': 30 * 60 * 1000,
    'getFiltrosPalabras': 30 * 60 * 1000,
    'getEmpresasElectricas': 30 * 60 * 1000,

    // Datos principales - caché medio (10 min)
    'getProcesos': 10 * 60 * 1000,
    'getEstadisticas': 10 * 60 * 1000,

    // Datos de seguimiento - caché corto (2 min)
    'getSeguimiento': 2 * 60 * 1000,

    // Datos por proceso - caché medio (5 min)
    'getCronograma': 5 * 60 * 1000,
    'getDocumentos': 5 * 60 * 1000,
    'getDatosSeace': 5 * 60 * 1000,
    'getProcesoOCDS': 5 * 60 * 1000,
    'getGrupoByNomenclatura': 5 * 60 * 1000,

    // Datos que no deben cachearse (o caché muy corto)
    'getSeguimientoDetalle': 1 * 60 * 1000,
  },
  persist: true,
  storagePrefix: 'seace_cache_',
};

// ==================== CACHÉ EN MEMORIA ====================

class MemoryCache {
  private cache = new Map<string, CacheEntry<unknown>>();
  private config: CacheConfig;

  constructor(config: Partial<CacheConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.loadFromStorage();
  }

  /**
   * Genera una clave única para la caché
   */
  private generateKey(action: string, params?: Record<string, string>): string {
    const paramsStr = params ? JSON.stringify(params, Object.keys(params).sort()) : '';
    return `${action}:${paramsStr}`;
  }

  /**
   * Obtiene el TTL para una acción específica
   */
  private getTTL(action: string): number {
    return this.config.ttlByAction[action] || this.config.defaultTTL;
  }

  /**
   * Obtiene un valor de la caché
   */
  get<T>(action: string, params?: Record<string, string>): T | null {
    const key = this.generateKey(action, params);
    const entry = this.cache.get(key) as CacheEntry<T> | undefined;

    if (!entry) {
      return null;
    }

    // Verificar si expiró
    const now = Date.now();
    if (now - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      this.removeFromStorage(key);
      console.log(`🗑️ Caché expirado: ${action}`);
      return null;
    }

    const age = Math.round((now - entry.timestamp) / 1000);
    console.log(`✅ Caché HIT: ${action} (edad: ${age}s)`);
    return entry.data;
  }

  /**
   * Guarda un valor en la caché
   */
  set<T>(action: string, params: Record<string, string> | undefined, data: T): void {
    const key = this.generateKey(action, params);
    const ttl = this.getTTL(action);

    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      ttl,
    };

    this.cache.set(key, entry);
    console.log(`💾 Caché SET: ${action} (TTL: ${Math.round(ttl / 1000)}s)`);

    // Persistir en localStorage
    if (this.config.persist) {
      this.saveToStorage(key, entry);
    }
  }

  /**
   * Invalida un valor específico de la caché
   */
  invalidate(action: string, params?: Record<string, string>): void {
    const key = this.generateKey(action, params);
    this.cache.delete(key);
    this.removeFromStorage(key);
    console.log(`🔄 Caché invalidado: ${action}`);
  }

  /**
   * Invalida todos los valores que coinciden con un patrón de acción
   */
  invalidateByAction(action: string): void {
    const keysToDelete: string[] = [];

    this.cache.forEach((_, key) => {
      if (key.startsWith(action)) {
        keysToDelete.push(key);
      }
    });

    keysToDelete.forEach(key => {
      this.cache.delete(key);
      this.removeFromStorage(key);
    });

    if (keysToDelete.length > 0) {
      console.log(`🔄 Caché invalidado por acción: ${action} (${keysToDelete.length} entradas)`);
    }
  }

  /**
   * Invalida cachés relacionados cuando se modifica seguimiento
   */
  invalidateSeguimiento(): void {
    this.invalidateByAction('getSeguimiento');
    this.invalidateByAction('getSeguimientoDetalle');
    console.log('🔄 Caché de seguimiento invalidado');
  }

  /**
   * Limpia toda la caché
   */
  clear(): void {
    this.cache.clear();
    this.clearStorage();
    console.log('🧹 Caché limpiada completamente');
  }

  /**
   * Obtiene estadísticas de la caché
   */
  getStats(): { entries: number; actions: string[]; size: string } {
    const actions = new Set<string>();
    this.cache.forEach((_, key) => {
      const action = key.split(':')[0];
      actions.add(action);
    });

    // Estimar tamaño en memoria
    let sizeBytes = 0;
    this.cache.forEach((entry) => {
      sizeBytes += JSON.stringify(entry).length * 2; // UTF-16
    });

    const sizeKB = (sizeBytes / 1024).toFixed(2);

    return {
      entries: this.cache.size,
      actions: Array.from(actions),
      size: `${sizeKB} KB`,
    };
  }

  // ==================== PERSISTENCIA ====================

  private saveToStorage(key: string, entry: CacheEntry<unknown>): void {
    try {
      const storageKey = this.config.storagePrefix + key;
      localStorage.setItem(storageKey, JSON.stringify(entry));
    } catch (error) {
      // localStorage lleno o no disponible
      console.warn('⚠️ No se pudo guardar en localStorage:', error);
    }
  }

  private removeFromStorage(key: string): void {
    try {
      const storageKey = this.config.storagePrefix + key;
      localStorage.removeItem(storageKey);
    } catch {
      // Ignorar errores
    }
  }

  private clearStorage(): void {
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith(this.config.storagePrefix)) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(key => localStorage.removeItem(key));
    } catch {
      // Ignorar errores
    }
  }

  private loadFromStorage(): void {
    if (!this.config.persist) return;

    try {
      const now = Date.now();
      let loaded = 0;
      let expired = 0;

      for (let i = 0; i < localStorage.length; i++) {
        const storageKey = localStorage.key(i);
        if (!storageKey?.startsWith(this.config.storagePrefix)) continue;

        const key = storageKey.replace(this.config.storagePrefix, '');
        const item = localStorage.getItem(storageKey);
        if (!item) continue;

        try {
          const entry = JSON.parse(item) as CacheEntry<unknown>;

          // Verificar si no expiró
          if (now - entry.timestamp <= entry.ttl) {
            this.cache.set(key, entry);
            loaded++;
          } else {
            localStorage.removeItem(storageKey);
            expired++;
          }
        } catch {
          // Entrada corrupta, eliminar
          localStorage.removeItem(storageKey);
        }
      }

      if (loaded > 0 || expired > 0) {
        console.log(`📦 Caché cargada: ${loaded} entradas válidas, ${expired} expiradas`);
      }
    } catch (error) {
      console.warn('⚠️ Error cargando caché desde localStorage:', error);
    }
  }
}

// ==================== INSTANCIA GLOBAL ====================

export const apiCache = new MemoryCache();

// ==================== DEDUPLICACIÓN DE PETICIONES EN VUELO ====================

// Almacena las promesas de peticiones en curso para evitar duplicados
const inFlightRequests = new Map<string, Promise<unknown>>();

/**
 * Genera una clave única para identificar una petición
 */
function generateRequestKey(action: string, params?: Record<string, string>): string {
  const paramsStr = params ? JSON.stringify(params, Object.keys(params).sort()) : '';
  return `${action}:${paramsStr}`;
}

// ==================== WRAPPER PARA FETCH API ====================

/**
 * Wrapper que añade caché a cualquier llamada de API
 * Incluye deduplicación de peticiones en vuelo para evitar llamadas duplicadas
 * Uso: const data = await cachedFetch(action, params, fetchFn);
 */
export async function cachedFetch<T>(
  action: string,
  params: Record<string, string> | undefined,
  fetchFn: () => Promise<T>,
  options?: {
    forceRefresh?: boolean;
    skipCache?: boolean;
  }
): Promise<T> {
  const requestKey = generateRequestKey(action, params);

  // Si se pide skip cache, ejecutar directamente
  if (options?.skipCache) {
    console.log(`⏭️ Saltando caché: ${action}`);
    return fetchFn();
  }

  // Intentar obtener de caché (si no es force refresh)
  if (!options?.forceRefresh) {
    const cached = apiCache.get<T>(action, params);
    if (cached !== null) {
      return cached;
    }
  }

  // Verificar si ya hay una petición en curso para este recurso
  const existingRequest = inFlightRequests.get(requestKey);
  if (existingRequest) {
    console.log(`⏳ Esperando petición en curso: ${action}`);
    return existingRequest as Promise<T>;
  }

  // Crear nueva petición y registrarla
  console.log(`🌐 Fetch: ${action}`);
  const fetchPromise = fetchFn()
    .then((data) => {
      apiCache.set(action, params, data);
      return data;
    })
    .finally(() => {
      // Limpiar la petición en curso cuando termine
      inFlightRequests.delete(requestKey);
    });

  // Registrar la petición en curso
  inFlightRequests.set(requestKey, fetchPromise);

  return fetchPromise;
}

// ==================== ACCIONES DE INVALIDACIÓN ====================

/**
 * Acciones que deben invalidar cachés específicas
 * Llamar después de operaciones de escritura
 */
export const cacheInvalidators = {
  // Cuando se modifica seguimiento
  onSeguimientoChange: () => {
    apiCache.invalidateSeguimiento();
  },

  // Cuando se agregan/modifican procesos
  onProcesosChange: () => {
    apiCache.invalidateByAction('getProcesos');
    apiCache.invalidateByAction('getEstadisticas');
    apiCache.invalidateByAction('getRegiones');
  },

  // Cuando se modifica un proceso específico
  onProcesoChange: (nomenclatura: string) => {
    apiCache.invalidate('getCronograma', { nomenclatura });
    apiCache.invalidate('getDocumentos', { nomenclatura });
    apiCache.invalidate('getDatosSeace', { nomenclatura });
    apiCache.invalidate('getProcesoOCDS', { nomenclatura });
    apiCache.invalidate('getSeguimientoDetalle', { nomenclatura });
    apiCache.invalidate('getGrupoByNomenclatura', { nomenclatura });
  },

  // Cuando cambian los filtros de entidades/palabras
  onFiltrosChange: () => {
    apiCache.invalidateByAction('getFiltrosEntidades');
    apiCache.invalidateByAction('getFiltrosPalabras');
  },

  // Limpiar todo
  clearAll: () => {
    apiCache.clear();
  },
};

// ==================== PRELOAD ESTRATÉGICO ====================

/**
 * Precarga datos que probablemente se necesitarán
 * Llamar al iniciar la app o al cambiar de vista
 */
export async function preloadEssentialData(
  fetchFunctions: {
    getProcesos: () => Promise<unknown>;
    getEstadisticas?: () => Promise<unknown>;
    getSeguimiento?: () => Promise<unknown>;
  }
): Promise<void> {
  const promises: Promise<unknown>[] = [];

  // Solo precargar si no están en caché
  if (!apiCache.get('getProcesos')) {
    promises.push(
      cachedFetch('getProcesos', undefined, fetchFunctions.getProcesos)
        .catch(e => console.error('Preload getProcesos error:', e))
    );
  }

  if (fetchFunctions.getEstadisticas && !apiCache.get('getEstadisticas')) {
    promises.push(
      cachedFetch('getEstadisticas', undefined, fetchFunctions.getEstadisticas)
        .catch(e => console.error('Preload getEstadisticas error:', e))
    );
  }

  if (fetchFunctions.getSeguimiento && !apiCache.get('getSeguimiento')) {
    promises.push(
      cachedFetch('getSeguimiento', undefined, fetchFunctions.getSeguimiento)
        .catch(e => console.error('Preload getSeguimiento error:', e))
    );
  }

  if (promises.length > 0) {
    console.log(`🚀 Precargando ${promises.length} recursos...`);
    await Promise.all(promises);
  }
}

// ==================== DEBUG ====================

// Exponer en window para debug (solo en desarrollo)
if (import.meta.env.DEV) {
  (window as unknown as { __seaceCache: typeof apiCache }).__seaceCache = apiCache;
  console.log('💡 Caché disponible en window.__seaceCache para debug');
}
