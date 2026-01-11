import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  Proceso,
  Seguimiento,
  FiltroEntidad,
  FiltroPalabra,
  EntidadUnica,
  FiltrosActivos,
  Estadisticas,
  RegionesConProcesos,
  MensajeChat,
  VistaActiva,
} from '../types';
import * as api from '../services/api';
import { cachedFetch, cacheInvalidators } from '../services/cache';

// ==================== ESTADO ====================

interface StoreState {
  // Datos
  procesos: Proceso[];
  procesosFiltrados: Proceso[];
  seguimiento: Seguimiento[];
  filtrosEntidades: FiltroEntidad[];
  filtrosPalabras: FiltroPalabra[];
  entidadesUnicas: EntidadUnica[];
  estadisticas: Estadisticas | null;
  regionesData: RegionesConProcesos;

  // Filtros activos
  filtros: FiltrosActivos;

  // UI
  vistaActiva: VistaActiva;
  procesoSeleccionado: Proceso | null;
  procesosSeleccionados: number[]; // IDs de procesos (únicos)
  cargando: boolean;
  error: string | null;

  // Chat IA
  mensajesChat: MensajeChat[];
  chatAbierto: boolean;

  // Config
  apiUrl: string;

  // Acciones
  setApiUrl: (url: string) => void;
  cargarProcesos: () => Promise<void>;
  cargarEstadisticas: () => Promise<void>;
  cargarRegiones: () => Promise<void>;
  cargarFiltros: () => Promise<void>;
  cargarSeguimiento: () => Promise<void>;
  cargarEntidadesUnicas: () => Promise<void>;
  cargarTodo: () => Promise<void>;

  // Filtros
  setFiltros: (filtros: Partial<FiltrosActivos>) => void;
  limpiarFiltros: () => void;
  aplicarFiltros: () => void;

  // Selección
  setProcesoSeleccionado: (proceso: Proceso | null) => void;
  toggleProcesoSeleccionado: (id: number) => void;
  seleccionarTodos: () => void;
  deseleccionarTodos: () => void;

  // Seguimiento
  agregarSeguimiento: (nomenclatura: string, estado: string, prioridad: string, notas: string) => Promise<void>;
  actualizarSeguimiento: (nomenclatura: string, estado?: string, prioridad?: string, notas?: string) => Promise<void>;
  eliminarSeguimiento: (nomenclatura: string) => Promise<boolean>;

  // UI
  setVistaActiva: (vista: VistaActiva) => void;
  setChatAbierto: (abierto: boolean) => void;
  agregarMensajeChat: (mensaje: MensajeChat) => void;
  limpiarChat: () => void;
}

// ==================== FILTROS INICIALES ====================

const filtrosIniciales: FiltrosActivos = {
  busqueda: '',
  regiones: [],
  entidades: [],
  objetos: [],
  palabrasClave: [],
  rangoValor: null,
  rangoFecha: { desde: null, hasta: null },
  // v3.1: Filtros de clasificación automática
  empresasCortas: [],
  estadosFecha: [],
  tiposServicio: [],
};

// ==================== STORE ====================

export const useStore = create<StoreState>()(
  persist(
    (set, get) => ({
      // Estado inicial
      procesos: [],
      procesosFiltrados: [],
      seguimiento: [],
      filtrosEntidades: [],
      filtrosPalabras: [],
      entidadesUnicas: [],
      estadisticas: null,
      regionesData: {},
      filtros: filtrosIniciales,
      vistaActiva: 'dashboard',
      procesoSeleccionado: null,
      procesosSeleccionados: [],
      cargando: false,
      error: null,
      mensajesChat: [],
      chatAbierto: false,
      apiUrl: '',

      // ==================== CONFIGURACIÓN ====================

      setApiUrl: (url) => set({ apiUrl: url }),

      // ==================== CARGA DE DATOS ====================

      cargarProcesos: async () => {
        set({ cargando: true, error: null });
        try {
          const usePrueba = api.useDatosPrueba();
          if (usePrueba) {
            set({
              procesos: api.DATOS_PRUEBA,
              procesosFiltrados: api.DATOS_PRUEBA,
              cargando: false
            });
            return;
          }

          // v3.1: Usar caché para mejorar velocidad
          const response = await cachedFetch(
            'getProcesos',
            undefined,
            () => api.getProcesos()
          );
          set({
            procesos: response.procesos,
            procesosFiltrados: response.procesos,
            cargando: false
          });
        } catch (error) {
          set({
            error: 'Error al cargar procesos',
            cargando: false,
            procesos: api.DATOS_PRUEBA,
            procesosFiltrados: api.DATOS_PRUEBA
          });
        }
      },

      cargarEstadisticas: async () => {
        try {
          if (api.useDatosPrueba()) {
            const procesos = api.DATOS_PRUEBA;
            const stats: Estadisticas = {
              totalProcesos: procesos.length,
              porRegion: {},
              porObjeto: {},
              porEntidad: {},
              valorTotal: 0,
              topEntidades: []
            };
            procesos.forEach(p => {
              stats.porRegion[p.REGION] = (stats.porRegion[p.REGION] || 0) + 1;
              stats.porObjeto[p.OBJETO] = (stats.porObjeto[p.OBJETO] || 0) + 1;
              stats.porEntidad[p.ENTIDAD] = (stats.porEntidad[p.ENTIDAD] || 0) + 1;
              stats.valorTotal += p.VALOR || 0;
            });
            stats.topEntidades = Object.entries(stats.porEntidad)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 10);
            set({ estadisticas: stats });
            return;
          }
          // v3.1: Usar caché
          const stats = await cachedFetch(
            'getEstadisticas',
            undefined,
            () => api.getEstadisticas()
          );
          set({ estadisticas: stats });
        } catch (error) {
          console.error('Error cargando estadísticas:', error);
        }
      },

      cargarRegiones: async () => {
        try {
          if (api.useDatosPrueba()) {
            const regiones: RegionesConProcesos = {};
            api.DATOS_PRUEBA.forEach(p => {
              if (!regiones[p.REGION]) {
                regiones[p.REGION] = { count: 0, valor: 0 };
              }
              regiones[p.REGION].count++;
              regiones[p.REGION].valor += p.VALOR || 0;
            });
            set({ regionesData: regiones });
            return;
          }
          // v3.1: Usar caché
          const regiones = await cachedFetch(
            'getRegiones',
            undefined,
            () => api.getRegionesConProcesos()
          );
          set({ regionesData: regiones });
        } catch (error) {
          console.error('Error cargando regiones:', error);
        }
      },

      cargarFiltros: async () => {
        try {
          if (api.useDatosPrueba()) return;
          // v3.1: Usar caché para ambas llamadas
          const [entidades, palabras] = await Promise.all([
            cachedFetch('getFiltrosEntidades', undefined, () => api.getFiltrosEntidades()),
            cachedFetch('getFiltrosPalabras', undefined, () => api.getFiltrosPalabras())
          ]);
          set({ filtrosEntidades: entidades, filtrosPalabras: palabras });
        } catch (error) {
          console.error('Error cargando filtros:', error);
        }
      },

      cargarSeguimiento: async () => {
        try {
          if (api.useDatosPrueba()) return;
          // v3.1: Usar caché (TTL corto de 2 min)
          const seguimiento = await cachedFetch(
            'getSeguimiento',
            undefined,
            () => api.getSeguimiento()
          );
          set({ seguimiento });
        } catch (error) {
          console.error('Error cargando seguimiento:', error);
        }
      },

      cargarEntidadesUnicas: async () => {
        try {
          if (api.useDatosPrueba()) {
            // Generar entidades únicas desde datos de prueba
            const conteo: Record<string, { count: number; valor: number; regiones: Set<string> }> = {};
            api.DATOS_PRUEBA.forEach(p => {
              if (!conteo[p.ENTIDAD]) {
                conteo[p.ENTIDAD] = { count: 0, valor: 0, regiones: new Set() };
              }
              conteo[p.ENTIDAD].count++;
              conteo[p.ENTIDAD].valor += p.VALOR || 0;
              conteo[p.ENTIDAD].regiones.add(p.REGION);
            });
            const entidades = Object.entries(conteo)
              .map(([entidad, data]) => ({
                entidad,
                count: data.count,
                valor: data.valor,
                regiones: Array.from(data.regiones)
              }))
              .sort((a, b) => b.count - a.count);
            set({ entidadesUnicas: entidades });
            return;
          }
          // v3.1: Usar caché
          const entidades = await cachedFetch(
            'getEntidadesUnicas',
            undefined,
            () => api.getEntidadesUnicas()
          );
          set({ entidadesUnicas: entidades });
        } catch (error) {
          console.error('Error cargando entidades únicas:', error);
        }
      },

      cargarTodo: async () => {
        const { cargarProcesos, cargarEstadisticas, cargarRegiones, cargarFiltros, cargarSeguimiento, cargarEntidadesUnicas } = get();
        set({ cargando: true });
        await Promise.all([
          cargarProcesos(),
          cargarEstadisticas(),
          cargarRegiones(),
          cargarFiltros(),
          cargarSeguimiento(),
          cargarEntidadesUnicas()
        ]);
        set({ cargando: false });
      },

      // ==================== FILTROS ====================

      setFiltros: (nuevosFiltros) => {
        set((state) => ({
          filtros: { ...state.filtros, ...nuevosFiltros }
        }));
        get().aplicarFiltros();
      },

      limpiarFiltros: () => {
        set({ filtros: filtrosIniciales });
        get().aplicarFiltros();
      },

      aplicarFiltros: () => {
        const { procesos, filtros } = get();
        let resultado = [...(procesos || [])];

        // Búsqueda global
        if (filtros.busqueda) {
          const busqueda = filtros.busqueda.toLowerCase();
          resultado = resultado.filter(p =>
            p.DESCRIPCION?.toLowerCase().includes(busqueda) ||
            p.ENTIDAD?.toLowerCase().includes(busqueda) ||
            p.NOMENCLATURA?.toLowerCase().includes(busqueda)
          );
        }

        // Regiones
        if (filtros.regiones.length > 0) {
          resultado = resultado.filter(p => filtros.regiones.includes(p.REGION));
        }

        // Entidades
        if (filtros.entidades.length > 0) {
          resultado = resultado.filter(p =>
            filtros.entidades.some(e => p.ENTIDAD?.toLowerCase().includes(e.toLowerCase()))
          );
        }

        // Objetos
        if (filtros.objetos.length > 0) {
          resultado = resultado.filter(p => filtros.objetos.includes(p.OBJETO));
        }

        // Palabras clave
        if (filtros.palabrasClave.length > 0) {
          resultado = resultado.filter(p =>
            filtros.palabrasClave.some(palabra =>
              p.DESCRIPCION?.toLowerCase().includes(palabra.toLowerCase())
            )
          );
        }

        // Rango de valor
        if (filtros.rangoValor) {
          resultado = resultado.filter(p =>
            p.VALOR >= filtros.rangoValor!.min && p.VALOR <= filtros.rangoValor!.max
          );
        }

        // v3.1: Filtro por empresas cortas (clasificación automática)
        if (filtros.empresasCortas.length > 0) {
          resultado = resultado.filter(p =>
            p.EMPRESA_CORTA && filtros.empresasCortas.includes(p.EMPRESA_CORTA)
          );
        }

        // v3.1: Filtro por estado de fecha (antigüedad)
        if (filtros.estadosFecha.length > 0) {
          resultado = resultado.filter(p =>
            p.ESTADO_FECHA && filtros.estadosFecha.includes(p.ESTADO_FECHA)
          );
        }

        // v3.1: Filtro por tipo de servicio
        if (filtros.tiposServicio.length > 0) {
          resultado = resultado.filter(p =>
            p.TIPO_SERVICIO && filtros.tiposServicio.includes(p.TIPO_SERVICIO)
          );
        }

        set({ procesosFiltrados: resultado });
      },

      // ==================== SELECCIÓN ====================

      setProcesoSeleccionado: (proceso) => set({ procesoSeleccionado: proceso }),

      toggleProcesoSeleccionado: (id) => {
        set((state) => {
          const existe = state.procesosSeleccionados.includes(id);
          return {
            procesosSeleccionados: existe
              ? state.procesosSeleccionados.filter(n => n !== id)
              : [...state.procesosSeleccionados, id]
          };
        });
      },

      seleccionarTodos: () => {
        const { procesosFiltrados } = get();
        set({ procesosSeleccionados: procesosFiltrados.map(p => p.ID) });
      },

      deseleccionarTodos: () => set({ procesosSeleccionados: [] }),

      // ==================== SEGUIMIENTO ====================

      agregarSeguimiento: async (nomenclatura, estado, prioridad, notas) => {
        try {
          // Usar la versión mejorada con OCDS automático
          const resultado = await api.addSeguimientoConOCDS(nomenclatura, estado, prioridad, notas, true);

          if (resultado.success) {
            console.log('✅ Seguimiento agregado:', resultado.mensaje);
            if (resultado.cronogramaActualizado) {
              console.log('📅 Cronograma actualizado automáticamente desde OCDS');
            }
            if (resultado.carpetaDrive) {
              console.log('📁 Carpeta creada:', resultado.carpetaDrive);
            }
          }

          // v3.1: Invalidar caché y recargar
          cacheInvalidators.onSeguimientoChange();
          get().cargarSeguimiento();
        } catch (error) {
          console.error('Error agregando seguimiento:', error);
        }
      },

      actualizarSeguimiento: async (nomenclatura, estado, prioridad, notas) => {
        try {
          await api.updateSeguimiento(nomenclatura, estado, prioridad, notas);
          // v3.1: Invalidar caché y recargar
          cacheInvalidators.onSeguimientoChange();
          get().cargarSeguimiento();
        } catch (error) {
          console.error('Error actualizando seguimiento:', error);
        }
      },

      eliminarSeguimiento: async (nomenclatura) => {
        try {
          const resultado = await api.deleteSeguimiento(nomenclatura);
          if (resultado.success) {
            // v3.1: Invalidar caché y recargar
            cacheInvalidators.onSeguimientoChange();
            get().cargarSeguimiento();
            return true;
          }
          return false;
        } catch (error) {
          console.error('Error eliminando seguimiento:', error);
          return false;
        }
      },

      // ==================== UI ====================

      setVistaActiva: (vista) => set({ vistaActiva: vista }),

      setChatAbierto: (abierto) => set({ chatAbierto: abierto }),

      agregarMensajeChat: (mensaje) => {
        set((state) => ({
          mensajesChat: [...state.mensajesChat, mensaje]
        }));
      },

      limpiarChat: () => set({ mensajesChat: [] }),
    }),
    {
      name: 'seace-store',
      partialize: (state) => ({
        apiUrl: state.apiUrl,
        filtros: state.filtros,
        mensajesChat: state.mensajesChat.slice(-50), // Solo últimos 50 mensajes
      }),
      // Merge para asegurar que campos nuevos tengan valores por defecto
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<StoreState>;
        return {
          ...currentState,
          ...persisted,
          // Asegurar que filtros tenga todos los campos con valores por defecto
          filtros: {
            ...filtrosIniciales,
            ...(persisted.filtros || {}),
          },
        };
      },
    }
  )
);
