import { openDB, type IDBPDatabase, type DBSchema } from 'idb';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

interface CacheRecord {
  key: string;
  action: string;
  data: unknown;
  timestamp: number;
  ttl: number;
}

interface CacheConfig {
  defaultTTL: number;
  ttlByAction: Record<string, number>;
  persist: boolean;
}

const DEFAULT_CONFIG: CacheConfig = {
  defaultTTL: 5 * 60 * 1000,
  ttlByAction: {
    'getRegiones': 30 * 60 * 1000,
    'getEntidadesUnicas': 30 * 60 * 1000,
    'getFiltrosEntidades': 30 * 60 * 1000,
    'getFiltrosPalabras': 30 * 60 * 1000,
    'getEmpresasElectricas': 30 * 60 * 1000,

    'getProcesos': 10 * 60 * 1000,
    'getEstadisticas': 10 * 60 * 1000,

    'getSeguimiento': 2 * 60 * 1000,

    'getCronograma': 30 * 60 * 1000,
    'getDocumentos': 30 * 60 * 1000,
    'getDatosSeace': 30 * 60 * 1000,
    'getProcesoOCDS': 60 * 60 * 1000,
    'getGrupoByNomenclatura': 24 * 60 * 60 * 1000,

    'getSeguimientoDetalle': 1 * 60 * 1000,
  },
  persist: true,
};

const DB_NAME = 'seace-cache';
const DB_VERSION = 1;
const STORE_NAME = 'cache';

interface SeaceCacheDB extends DBSchema {
  cache: {
    key: string;
    value: CacheRecord;
  };
}

let dbPromise: Promise<IDBPDatabase<SeaceCacheDB>> | null = null;
let idbUnavailable = false;
let idbWarned = false;

function warnIdbUnavailable(error: unknown): void {
  if (!idbWarned) {
    idbWarned = true;
    console.warn('IndexedDB no disponible, usando caché en memoria:', error);
  }
  idbUnavailable = true;
}

function getDB(): Promise<IDBPDatabase<SeaceCacheDB>> | null {
  if (idbUnavailable) return null;
  if (typeof indexedDB === 'undefined') {
    warnIdbUnavailable('indexedDB is undefined');
    return null;
  }
  if (!dbPromise) {
    try {
      dbPromise = openDB<SeaceCacheDB>(DB_NAME, DB_VERSION, {
        upgrade(db) {
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME, { keyPath: 'key' });
          }
        },
      }).catch((error) => {
        warnIdbUnavailable(error);
        throw error;
      });
    } catch (error) {
      warnIdbUnavailable(error);
      return null;
    }
  }
  return dbPromise;
}

class MemoryCache {
  private cache = new Map<string, CacheEntry<unknown>>();
  private config: CacheConfig;
  private hydrationPromise: Promise<void> | null = null;

  constructor(config: Partial<CacheConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    if (this.config.persist) {
      this.hydrationPromise = this.hydrateFromIDB();
    }
  }

  private generateKey(action: string, params?: Record<string, string>): string {
    const paramsStr = params ? JSON.stringify(params, Object.keys(params).sort()) : '';
    return `${action}:${paramsStr}`;
  }

  private getTTL(action: string): number {
    return this.config.ttlByAction[action] || this.config.defaultTTL;
  }

  get<T>(action: string, params?: Record<string, string>): T | null {
    const key = this.generateKey(action, params);
    const entry = this.cache.get(key) as CacheEntry<T> | undefined;

    if (!entry) {
      return null;
    }

    const now = Date.now();
    if (now - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      this.deleteFromIDB(key);
      console.log(`🗑️ Caché expirado: ${action}`);
      return null;
    }

    const age = Math.round((now - entry.timestamp) / 1000);
    console.log(`✅ Caché HIT: ${action} (edad: ${age}s)`);
    return entry.data;
  }

  peekEntry<T>(action: string, params?: Record<string, string>): CacheEntry<T> | null {
    const key = this.generateKey(action, params);
    const entry = this.cache.get(key) as CacheEntry<T> | undefined;
    return entry ?? null;
  }

  isExpired(entry: CacheEntry<unknown>): boolean {
    return Date.now() - entry.timestamp > entry.ttl;
  }

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

    if (this.config.persist) {
      this.writeToIDB(key, action, entry);
    }
  }

  invalidate(action: string, params?: Record<string, string>): void {
    const key = this.generateKey(action, params);
    this.cache.delete(key);
    this.deleteFromIDB(key);
    console.log(`🔄 Caché invalidado: ${action}`);
  }

  invalidateByAction(action: string): void {
    const keysToDelete: string[] = [];

    this.cache.forEach((_, key) => {
      if (key.startsWith(action)) {
        keysToDelete.push(key);
      }
    });

    keysToDelete.forEach(key => {
      this.cache.delete(key);
      this.deleteFromIDB(key);
    });

    if (keysToDelete.length > 0) {
      console.log(`🔄 Caché invalidado por acción: ${action} (${keysToDelete.length} entradas)`);
    }
  }

  invalidateSeguimiento(): void {
    this.invalidateByAction('getSeguimiento');
    this.invalidateByAction('getSeguimientoDetalle');
    console.log('🔄 Caché de seguimiento invalidado');
  }

  clear(): void {
    this.cache.clear();
    this.clearIDB();
    console.log('🧹 Caché limpiada completamente');
  }

  getStats(): { entries: number; actions: string[]; size: string } {
    const actions = new Set<string>();
    this.cache.forEach((_, key) => {
      const action = key.split(':')[0];
      actions.add(action);
    });

    let sizeBytes = 0;
    this.cache.forEach((entry) => {
      sizeBytes += JSON.stringify(entry).length * 2;
    });

    const sizeKB = (sizeBytes / 1024).toFixed(2);

    return {
      entries: this.cache.size,
      actions: Array.from(actions),
      size: `${sizeKB} KB`,
    };
  }

  private async writeToIDB(key: string, action: string, entry: CacheEntry<unknown>): Promise<void> {
    const dbP = getDB();
    if (!dbP) return;
    try {
      const db = await dbP;
      const record: CacheRecord = {
        key,
        action,
        data: entry.data,
        timestamp: entry.timestamp,
        ttl: entry.ttl,
      };
      await db.put(STORE_NAME, record);
    } catch (error) {
      warnIdbUnavailable(error);
    }
  }

  private async deleteFromIDB(key: string): Promise<void> {
    const dbP = getDB();
    if (!dbP) return;
    try {
      const db = await dbP;
      await db.delete(STORE_NAME, key);
    } catch (error) {
      warnIdbUnavailable(error);
    }
  }

  private async clearIDB(): Promise<void> {
    const dbP = getDB();
    if (!dbP) return;
    try {
      const db = await dbP;
      await db.clear(STORE_NAME);
    } catch (error) {
      warnIdbUnavailable(error);
    }
  }

  private async hydrateFromIDB(): Promise<void> {
    const dbP = getDB();
    if (!dbP) return;
    try {
      const db = await dbP;
      const records = await db.getAll(STORE_NAME);
      const now = Date.now();
      let loaded = 0;
      let expired = 0;
      const expiredKeys: string[] = [];

      for (const record of records) {
        const entry: CacheEntry<unknown> = {
          data: record.data,
          timestamp: record.timestamp,
          ttl: record.ttl,
        };
        if (now - entry.timestamp <= entry.ttl) {
          if (!this.cache.has(record.key)) {
            this.cache.set(record.key, entry);
            loaded++;
          }
        } else {
          expiredKeys.push(record.key);
          expired++;
        }
      }

      if (expiredKeys.length > 0) {
        try {
          const tx = db.transaction(STORE_NAME, 'readwrite');
          await Promise.all(expiredKeys.map(k => tx.store.delete(k)));
          await tx.done;
        } catch {
          // ignore cleanup errors
        }
      }

      if (loaded > 0 || expired > 0) {
        console.log(`📦 Caché cargada: ${loaded} entradas válidas, ${expired} expiradas`);
      }
    } catch (error) {
      warnIdbUnavailable(error);
    }
  }

  hydrationReady(): Promise<void> {
    return this.hydrationPromise ?? Promise.resolve();
  }
}

export const apiCache = new MemoryCache();

const inFlightRequests = new Map<string, Promise<unknown>>();

function generateRequestKey(action: string, params?: Record<string, string>): string {
  const paramsStr = params ? JSON.stringify(params, Object.keys(params).sort()) : '';
  return `${action}:${paramsStr}`;
}

function runFetch<T>(
  action: string,
  params: Record<string, string> | undefined,
  fetchFn: () => Promise<T>,
  requestKey: string
): Promise<T> {
  const existingRequest = inFlightRequests.get(requestKey);
  if (existingRequest) {
    console.log(`⏳ Esperando petición en curso: ${action}`);
    return existingRequest as Promise<T>;
  }

  console.log(`🌐 Fetch: ${action}`);
  const fetchPromise = fetchFn()
    .then((data) => {
      apiCache.set(action, params, data);
      return data;
    })
    .finally(() => {
      inFlightRequests.delete(requestKey);
    });

  inFlightRequests.set(requestKey, fetchPromise);
  return fetchPromise;
}

export async function cachedFetch<T>(
  action: string,
  params: Record<string, string> | undefined,
  fetchFn: () => Promise<T>,
  options?: {
    forceRefresh?: boolean;
    skipCache?: boolean;
    swr?: boolean;
  }
): Promise<T> {
  const requestKey = generateRequestKey(action, params);
  const swrEnabled = options?.swr !== false && !options?.forceRefresh;

  if (options?.skipCache) {
    console.log(`⏭️ Saltando caché: ${action}`);
    return fetchFn();
  }

  if (!options?.forceRefresh) {
    const entry = apiCache.peekEntry<T>(action, params);
    if (entry) {
      if (!apiCache.isExpired(entry)) {
        const age = Math.round((Date.now() - entry.timestamp) / 1000);
        console.log(`✅ Caché HIT: ${action} (edad: ${age}s)`);
        return entry.data;
      }
      if (swrEnabled) {
        console.log(`♻️ SWR: ${action} (sirviendo stale y revalidando)`);
        runFetch(action, params, fetchFn, requestKey).catch((e) => {
          console.error(`SWR revalidación falló ${action}:`, e);
        });
        return entry.data;
      }
    }
  }

  return runFetch(action, params, fetchFn, requestKey);
}

export const cacheInvalidators = {
  onSeguimientoChange: () => {
    apiCache.invalidateSeguimiento();
  },

  onProcesosChange: () => {
    apiCache.invalidateByAction('getProcesos');
    apiCache.invalidateByAction('getEstadisticas');
    apiCache.invalidateByAction('getRegiones');
  },

  onProcesoChange: (nomenclatura: string) => {
    apiCache.invalidate('getCronograma', { nomenclatura });
    apiCache.invalidate('getDocumentos', { nomenclatura });
    apiCache.invalidate('getDatosSeace', { nomenclatura });
    apiCache.invalidate('getProcesoOCDS', { nomenclatura });
    apiCache.invalidate('getSeguimientoDetalle', { nomenclatura });
    apiCache.invalidate('getGrupoByNomenclatura', { nomenclatura });
  },

  onFiltrosChange: () => {
    apiCache.invalidateByAction('getFiltrosEntidades');
    apiCache.invalidateByAction('getFiltrosPalabras');
  },

  clearAll: () => {
    apiCache.clear();
  },
};

export async function preloadEssentialData(
  fetchFunctions: {
    getProcesos: () => Promise<unknown>;
    getEstadisticas?: () => Promise<unknown>;
    getSeguimiento?: () => Promise<unknown>;
  }
): Promise<void> {
  const promises: Promise<unknown>[] = [];

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

if (import.meta.env.DEV) {
  (window as unknown as { __seaceCache: typeof apiCache }).__seaceCache = apiCache;
  console.log('💡 Caché disponible en window.__seaceCache para debug');
}
