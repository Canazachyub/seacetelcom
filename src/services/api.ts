import type {
  Proceso,
  Cronograma,
  Seguimiento,
  SeguimientoDetalle,
  Documento,
  EtapaSeace,
  EstadoEtapa,
  FiltroEntidad,
  FiltroPalabra,
  EntidadUnica,
  Estadisticas,
  RegionesConProcesos,
  ProcesosResponse,
  GrupoHistorico,
  DatosSeace,
  EmpresaElectrica,
  ProcesoDetalleCompleto,
  ComparativaHistoricos,
  DatosHistoricoExtraido,
  UploadResult,
  EnlaceRapido,
} from '../types';

// Tipo para procesos OCDS del índice
interface ProcesoOCDS {
  ocid: string;
  tenderId: string;
  nomenclatura: string;
  entidad: string;
  descripcion: string;
  valor: number;
  moneda: string;
  fecha: string;
  estado: string;
}

// ==================== CONFIGURACIÓN ====================

// IMPORTANTE: Reemplaza esta URL con tu URL de Apps Script desplegado
const API_BASE_URL = import.meta.env.VITE_API_URL || '';

// ==================== HELPER ====================

async function fetchAPI<T>(
  action: string,
  params: Record<string, string> = {},
  _method: 'GET' | 'POST' = 'GET',
  body?: Record<string, unknown>
): Promise<T> {
  const url = new URL(API_BASE_URL);
  url.searchParams.set('action', action);

  // Agregar parámetros de filtros
  Object.entries(params).forEach(([key, value]) => {
    if (value) url.searchParams.set(key, value);
  });

  // Para operaciones que normalmente serían POST, enviar datos como parámetros GET
  // Google Apps Script maneja mejor GET para CORS
  if (body) {
    // Si el body tiene muchos campos o es complejo, serializarlo como JSON
    const bodyKeys = Object.keys(body);
    const hasComplexData = bodyKeys.some(key => {
      const value = body[key];
      return Array.isArray(value) || (typeof value === 'object' && value !== null);
    });

    if (hasComplexData || bodyKeys.length > 10) {
      // Serializar todo el body como un solo parámetro JSON
      url.searchParams.set('data', JSON.stringify(body));
      console.log('📦 Enviando datos complejos como JSON:', body);
    } else {
      // Para datos simples, usar parámetros individuales
      Object.entries(body).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          url.searchParams.set(key, String(value));
        }
      });
    }
  }

  try {
    console.log(`🌐 API Request: ${action}`);
    console.log(`🔗 URL: ${url.toString().substring(0, 200)}...`);

    // Usar siempre GET para evitar problemas de CORS con Google Apps Script
    const response = await fetch(url.toString(), {
      method: 'GET',
      redirect: 'follow',
    });

    console.log(`📡 Response status: ${response.status} ${response.statusText}`);

    if (!response.ok) {
      // Intentar leer el mensaje de error del backend
      let errorMessage = `HTTP ${response.status}`;
      try {
        const errorData = await response.json();
        if (errorData.error) {
          errorMessage += `: ${errorData.error}`;
        }
      } catch {
        // Si no se puede parsear, usar el status text
        errorMessage += `: ${response.statusText}`;
      }

      const error = new Error(errorMessage);
      (error as any).status = response.status;
      (error as any).statusText = response.statusText;
      throw error;
    }

    const data = await response.json();
    console.log(`✅ Response data:`, data);
    return data;
  } catch (error) {
    console.error(`❌ API Error [${action}]:`, error);
    throw error;
  }
}

// ==================== FUNCIONES GET ====================

export async function getProcesos(filtros?: {
  region?: string;
  entidad?: string;
  objeto?: string;
  busqueda?: string;
  palabrasClave?: string[];
}): Promise<ProcesosResponse> {
  const params: Record<string, string> = {};

  if (filtros?.region) params.region = filtros.region;
  if (filtros?.entidad) params.entidad = filtros.entidad;
  if (filtros?.objeto) params.objeto = filtros.objeto;
  if (filtros?.busqueda) params.busqueda = filtros.busqueda;
  if (filtros?.palabrasClave?.length) {
    params.palabrasClave = filtros.palabrasClave.join(',');
  }

  return fetchAPI<ProcesosResponse>('getProcesos', params);
}

export async function getCronograma(nomenclatura: string): Promise<Cronograma[]> {
  return fetchAPI<Cronograma[]>('getCronograma', { nomenclatura });
}

export async function getSeguimiento(): Promise<Seguimiento[]> {
  return fetchAPI<Seguimiento[]>('getSeguimiento');
}

export async function getFiltrosEntidades(): Promise<FiltroEntidad[]> {
  return fetchAPI<FiltroEntidad[]>('getFiltrosEntidades');
}

export async function getFiltrosPalabras(): Promise<FiltroPalabra[]> {
  return fetchAPI<FiltroPalabra[]>('getFiltrosPalabras');
}

export async function getEstadisticas(): Promise<Estadisticas> {
  return fetchAPI<Estadisticas>('getEstadisticas');
}

export async function getRegionesConProcesos(): Promise<RegionesConProcesos> {
  return fetchAPI<RegionesConProcesos>('getRegiones');
}

export async function getEntidadesUnicas(): Promise<EntidadUnica[]> {
  return fetchAPI<EntidadUnica[]>('getEntidadesUnicas');
}

// ==================== FUNCIONES POST ====================

export async function addSeguimiento(
  nomenclatura: string,
  estado: string,
  prioridad: string,
  notas: string
): Promise<{ success: boolean }> {
  return fetchAPI<{ success: boolean }>(
    'addSeguimiento',
    {},
    'POST',
    { nomenclatura, estado, prioridad, notas }
  );
}

export async function updateSeguimiento(
  nomenclatura: string,
  estado?: string,
  prioridad?: string,
  notas?: string
): Promise<{ success: boolean }> {
  return fetchAPI<{ success: boolean }>(
    'updateSeguimiento',
    {},
    'POST',
    { nomenclatura, estado, prioridad, notas }
  );
}

export async function deleteSeguimiento(
  nomenclatura: string
): Promise<{ success: boolean; mensaje?: string }> {
  return fetchAPI<{ success: boolean; mensaje?: string }>(
    'deleteSeguimiento',
    {},
    'POST',
    { nomenclatura }
  );
}

export async function addFiltroEntidad(entidad: string): Promise<{ success: boolean }> {
  return fetchAPI<{ success: boolean }>(
    'addFiltroEntidad',
    {},
    'POST',
    { entidad }
  );
}

export async function addFiltroPalabra(palabra: string): Promise<{ success: boolean }> {
  return fetchAPI<{ success: boolean }>(
    'addFiltroPalabra',
    {},
    'POST',
    { palabra }
  );
}

export async function toggleFiltro(
  tipo: 'entidad' | 'palabra',
  valor: string,
  activo: boolean
): Promise<{ success: boolean }> {
  return fetchAPI<{ success: boolean }>(
    'toggleFiltro',
    {},
    'POST',
    { tipo, valor, activo }
  );
}

export async function procesarImport(): Promise<{
  success: boolean;
  mensaje: string;
  total: number;
}> {
  return fetchAPI('procesarImport', {}, 'POST', {});
}

// ==================== SEGUIMIENTO v2.0 ====================

export async function getSeguimientoDetalle(nomenclatura: string): Promise<SeguimientoDetalle> {
  return fetchAPI<SeguimientoDetalle>('getSeguimientoDetalle', { nomenclatura });
}

export async function addSeguimientoCompleto(
  nomenclatura: string,
  estado: string,
  prioridad: string,
  notas: string,
  crearCarpeta: boolean = true
): Promise<{ success: boolean; carpetaDrive?: string }> {
  return fetchAPI<{ success: boolean; carpetaDrive?: string }>(
    'addSeguimiento',
    {},
    'POST',
    { nomenclatura, estado, prioridad, notas, crearCarpeta: crearCarpeta ? 'true' : 'false' }
  );
}

/**
 * Agrega un proceso a seguimiento CON datos OCDS automáticos
 * - Intenta obtener datos OCDS del proceso
 * - Pre-carga el cronograma con fechas reales
 * - Crea carpeta en Drive
 * - Retorna información completa del proceso
 */
export interface AddSeguimientoConOCDSStatus {
  ocdsLoaded: boolean;
  seguimientoCreated: boolean;
  etapasUpdated: number;
  etapasTotal: number;
  errors: string[];
}

export interface AddSeguimientoConOCDSResult {
  success: boolean;
  carpetaDrive?: string;
  datosOCDS?: DatosProcesoOCDS;
  cronogramaActualizado?: boolean;
  mensaje?: string;
  partial?: boolean;
  rolledBack?: boolean;
  status?: AddSeguimientoConOCDSStatus;
}

export async function addSeguimientoConOCDS(
  nomenclatura: string,
  estado: string,
  prioridad: string,
  notas: string,
  crearCarpeta: boolean = true,
  rollbackOnPartialFailure: boolean = false
): Promise<AddSeguimientoConOCDSResult> {
  const status: AddSeguimientoConOCDSStatus = {
    ocdsLoaded: false,
    seguimientoCreated: false,
    etapasUpdated: 0,
    etapasTotal: 0,
    errors: [],
  };

  let datosOCDS: DatosProcesoOCDS | null = null;
  try {
    datosOCDS = await getProcesoOCDS(nomenclatura);
    status.ocdsLoaded = datosOCDS !== null;
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Error desconocido al obtener OCDS';
    console.error('Error obteniendo OCDS en addSeguimientoConOCDS:', error);
    status.errors.push(`OCDS: ${msg}`);
  }

  let resultado: { success: boolean; carpetaDrive?: string };
  try {
    resultado = await addSeguimientoCompleto(
      nomenclatura,
      estado,
      prioridad,
      notas,
      crearCarpeta
    );
    if (!resultado.success) {
      throw new Error('addSeguimientoCompleto retornó success=false');
    }
    status.seguimientoCreated = true;
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Error al agregar a seguimiento';
    console.error('Error creando seguimiento en addSeguimientoConOCDS:', error);
    status.errors.push(`Seguimiento: ${msg}`);
    return { success: false, mensaje: msg, status };
  }

  const etapasPlan: Array<{
    etapa: EtapaSeace;
    inicio: string;
    fin: string;
  }> = [];

  if (datosOCDS && datosOCDS.cronograma) {
    if (datosOCDS.cronograma.convocatoriaInicio) {
      etapasPlan.push({
        etapa: 'CONVOCATORIA',
        inicio: datosOCDS.cronograma.convocatoriaInicio,
        fin: datosOCDS.cronograma.convocatoriaFin || datosOCDS.cronograma.convocatoriaInicio,
      });
    }
    if (datosOCDS.cronograma.consultasInicio) {
      etapasPlan.push({
        etapa: 'CONSULTAS_OBSERVACIONES',
        inicio: datosOCDS.cronograma.consultasInicio,
        fin: datosOCDS.cronograma.consultasFin || datosOCDS.cronograma.consultasInicio,
      });
    }
    if (datosOCDS.cronograma.buenaPro) {
      etapasPlan.push({
        etapa: 'BUENA_PRO',
        inicio: datosOCDS.cronograma.buenaPro,
        fin: datosOCDS.cronograma.buenaPro,
      });
    }
  }

  status.etapasTotal = etapasPlan.length;

  for (const plan of etapasPlan) {
    try {
      await updateEtapaSeguimiento(
        nomenclatura,
        plan.etapa,
        'COMPLETADO',
        plan.inicio,
        plan.fin,
        'Actualizado desde OCDS'
      );
      status.etapasUpdated++;
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Error desconocido';
      console.error(`Error actualizando etapa ${plan.etapa} en addSeguimientoConOCDS:`, error);
      status.errors.push(`Etapa ${plan.etapa}: ${msg}`);
    }
  }

  const hasEtapaFailures = status.etapasTotal > 0 && status.etapasUpdated < status.etapasTotal;

  if (hasEtapaFailures && rollbackOnPartialFailure) {
    let rolledBack = false;
    try {
      const del = await deleteSeguimiento(nomenclatura);
      rolledBack = del.success;
      if (!del.success) {
        status.errors.push(`Rollback: deleteSeguimiento retornó success=false`);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Error desconocido';
      console.error('Error en rollback de addSeguimientoConOCDS:', error);
      status.errors.push(`Rollback: ${msg}`);
    }
    return {
      success: false,
      rolledBack,
      mensaje: `Rollback ejecutado: solo ${status.etapasUpdated} de ${status.etapasTotal} etapas sincronizadas`,
      status,
      datosOCDS: datosOCDS ?? undefined,
      carpetaDrive: resultado.carpetaDrive,
    };
  }

  if (hasEtapaFailures) {
    return {
      success: true,
      partial: true,
      carpetaDrive: resultado.carpetaDrive,
      datosOCDS: datosOCDS ?? undefined,
      cronogramaActualizado: status.etapasUpdated > 0,
      mensaje: `Seguimiento creado con ${status.etapasUpdated} de ${status.etapasTotal} etapas sincronizadas`,
      status,
    };
  }

  if (datosOCDS && datosOCDS.cronograma) {
    return {
      success: true,
      carpetaDrive: resultado.carpetaDrive,
      datosOCDS,
      cronogramaActualizado: status.etapasUpdated > 0,
      mensaje: `Proceso agregado con ${status.etapasUpdated} etapas actualizadas desde OCDS`,
      status,
    };
  }

  return {
    success: true,
    carpetaDrive: resultado.carpetaDrive,
    mensaje: status.ocdsLoaded
      ? 'Proceso agregado a seguimiento. Sin cronograma OCDS.'
      : 'Proceso agregado a seguimiento. Datos OCDS no disponibles.',
    status,
  };
}

/**
 * Actualiza el cronograma de un proceso en seguimiento desde OCDS
 */
export async function actualizarCronogramaDesdeOCDS(
  nomenclatura: string
): Promise<{
  success: boolean;
  etapasActualizadas: number;
  mensaje: string;
}> {
  try {
    const datosOCDS = await getProcesoOCDS(nomenclatura);

    if (!datosOCDS || !datosOCDS.cronograma) {
      return {
        success: false,
        etapasActualizadas: 0,
        mensaje: 'No se encontraron datos OCDS para este proceso'
      };
    }

    let etapasActualizadas = 0;

    // Convocatoria
    if (datosOCDS.cronograma.convocatoriaInicio) {
      await updateEtapaSeguimiento(
        nomenclatura,
        'CONVOCATORIA',
        'COMPLETADO',
        datosOCDS.cronograma.convocatoriaInicio,
        datosOCDS.cronograma.convocatoriaFin || datosOCDS.cronograma.convocatoriaInicio,
        '📅 Actualizado desde OCDS'
      );
      etapasActualizadas++;
    }

    // Consultas
    if (datosOCDS.cronograma.consultasInicio) {
      await updateEtapaSeguimiento(
        nomenclatura,
        'CONSULTAS_OBSERVACIONES',
        'COMPLETADO',
        datosOCDS.cronograma.consultasInicio,
        datosOCDS.cronograma.consultasFin || datosOCDS.cronograma.consultasInicio,
        '📅 Actualizado desde OCDS'
      );
      etapasActualizadas++;
    }

    // Buena Pro
    if (datosOCDS.cronograma.buenaPro) {
      await updateEtapaSeguimiento(
        nomenclatura,
        'BUENA_PRO',
        'COMPLETADO',
        datosOCDS.cronograma.buenaPro,
        datosOCDS.cronograma.buenaPro,
        '📅 Actualizado desde OCDS'
      );
      etapasActualizadas++;
    }

    return {
      success: true,
      etapasActualizadas,
      mensaje: `${etapasActualizadas} etapas actualizadas correctamente desde OCDS`
    };
  } catch (error) {
    return {
      success: false,
      etapasActualizadas: 0,
      mensaje: error instanceof Error ? error.message : 'Error al actualizar desde OCDS'
    };
  }
}

export async function updateEtapaSeguimiento(
  nomenclatura: string,
  etapa: EtapaSeace,
  estado: EstadoEtapa,
  inicio?: string,
  fin?: string,
  notas?: string,
  año?: number,
  link?: string
): Promise<{ success: boolean }> {
  return fetchAPI<{ success: boolean }>(
    'updateEtapaSeguimiento',
    {},
    'POST',
    {
      nomenclatura,
      etapa,
      estado,
      fechaInicio: inicio,
      fechaFin: fin,
      notas,
      año,
      link
    }
  );
}

// ==================== DOCUMENTOS ====================

export async function getDocumentos(nomenclatura?: string): Promise<Documento[]> {
  const params: Record<string, string> = {};
  if (nomenclatura) params.nomenclatura = nomenclatura;
  return fetchAPI<Documento[]>('getDocumentos', params);
}

export async function addDocumento(
  nomenclatura: string,
  etapa: EtapaSeace,
  tipoDocumento: string,
  nombreArchivo: string,
  urlArchivo: string,
  urlDrive?: string,
  notas?: string
): Promise<{ success: boolean }> {
  return fetchAPI<{ success: boolean }>(
    'addDocumento',
    {},
    'POST',
    { nomenclatura, etapa, tipoDocumento, nombreArchivo, urlArchivo, urlDrive, notas }
  );
}

// ==================== DRIVE ====================

export async function crearCarpetaDrive(nomenclatura: string): Promise<{
  success: boolean;
  carpetaUrl?: string;
  error?: string;
}> {
  return fetchAPI<{ success: boolean; carpetaUrl?: string; error?: string }>(
    'crearCarpetaDrive',
    {},
    'POST',
    { nomenclatura }
  );
}

export interface ArchivoDrive {
  nombre: string;
  url: string;
  id: string;
  tipo: string;
  tamaño: number;
  fechaCreacion: string;
  fechaModificacion: string;
  subcarpeta: string | null;
}

export async function listarArchivosDrive(carpetaUrl: string): Promise<{
  success: boolean;
  archivos?: ArchivoDrive[];
  total?: number;
  mensaje?: string;
  error?: string;
}> {
  return fetchAPI<{
    success: boolean;
    archivos?: ArchivoDrive[];
    total?: number;
    mensaje?: string;
    error?: string;
  }>(
    'listarArchivosDrive',
    { carpetaUrl },
    'GET'
  );
}

// ==================== CONSTANTES DE ETAPAS ====================

export const ETAPAS_SEACE: { key: EtapaSeace; nombre: string; descripcion: string }[] = [
  { key: 'CONVOCATORIA', nombre: 'Convocatoria', descripcion: 'Publicación del proceso' },
  { key: 'REGISTRO_PARTICIPANTES', nombre: 'Registro de Participantes', descripcion: 'Inscripción electrónica' },
  { key: 'CONSULTAS_OBSERVACIONES', nombre: 'Consultas y Observaciones', descripcion: 'Formulación electrónica' },
  { key: 'ABSOLUCION_CONSULTAS', nombre: 'Absolución', descripcion: 'Respuesta a consultas' },
  { key: 'INTEGRACION_BASES', nombre: 'Integración de Bases', descripcion: 'Bases finales' },
  { key: 'PRESENTACION_PROPUESTAS', nombre: 'Presentación de Propuestas', descripcion: 'Envío electrónico' },
  { key: 'CALIFICACION_EVALUACION', nombre: 'Calificación y Evaluación', descripcion: 'Evaluación de propuestas' },
  { key: 'BUENA_PRO', nombre: 'Buena Pro', descripcion: 'Otorgamiento' },
];

export const ESTADOS_ETAPA: { key: EstadoEtapa; nombre: string; color: string }[] = [
  { key: 'PENDIENTE', nombre: 'Pendiente', color: 'gray' },
  { key: 'EN_CURSO', nombre: 'En Curso', color: 'blue' },
  { key: 'COMPLETADO', nombre: 'Completado', color: 'green' },
  { key: 'VENCIDO', nombre: 'Vencido', color: 'red' },
  { key: 'NO_APLICA', nombre: 'No Aplica', color: 'slate' },
];

// ==================== DATOS DE PRUEBA (sin API) ====================

export const DATOS_PRUEBA: Proceso[] = [
  {
    ID: 1,
    NOMENCLATURA: 'CP-SM-15-2025-ELECTROSUR-1',
    ENTIDAD: 'ELECTROSUR S.A.',
    REGION: 'AREQUIPA',
    OBJETO: 'Servicio',
    DESCRIPCION: 'Servicio de cambio de luminarias LED en subestaciones de distribución',
    VALOR: 150000,
    MONEDA: 'PEN',
    FECHA_PUB: '2025-01-15',
    VERSION: 4,
    REINICIADO: null,
    URL: null,
    EMPRESA_CORTA: 'ELECTROSUR',
    ESTADO_FECHA: 'ESTE MES',
    TIPO_SERVICIO: 'ALUMBRADO',
  },
  {
    ID: 2,
    NOMENCLATURA: 'AS-SM-47-2025-SEAL-1',
    ENTIDAD: 'SEAL - Sociedad Eléctrica del Sur Oeste',
    REGION: 'AREQUIPA',
    OBJETO: 'Bien',
    DESCRIPCION: 'Adquisición de transformadores de distribución 10/0.38 kV',
    VALOR: 280000,
    MONEDA: 'PEN',
    FECHA_PUB: '2025-01-20',
    VERSION: 4,
    REINICIADO: null,
    URL: null,
    EMPRESA_CORTA: 'SEAL',
    ESTADO_FECHA: 'ESTE MES',
    TIPO_SERVICIO: 'TRANSFORMADORES',
  },
  {
    ID: 3,
    NOMENCLATURA: 'CP-SM-8-2025-SEDAPAL-1',
    ENTIDAD: 'SEDAPAL',
    REGION: 'LIMA',
    OBJETO: 'Obra',
    DESCRIPCION: 'Mejoramiento del sistema de agua potable sector norte',
    VALOR: 2500000,
    MONEDA: 'PEN',
    FECHA_PUB: '2025-01-18',
    VERSION: 4,
    REINICIADO: null,
    URL: null,
    EMPRESA_CORTA: 'OTROS',
    ESTADO_FECHA: 'ESTE MES',
    TIPO_SERVICIO: 'CONSTRUCCIÓN',
  },
  {
    ID: 4,
    NOMENCLATURA: 'AS-SM-12-2025-HIDRANDINA-1',
    ENTIDAD: 'HIDRANDINA S.A.',
    REGION: 'LA LIBERTAD',
    OBJETO: 'Servicio',
    DESCRIPCION: 'Servicio de mantenimiento preventivo de subestaciones',
    VALOR: 95000,
    MONEDA: 'PEN',
    FECHA_PUB: '2025-01-22',
    VERSION: 4,
    REINICIADO: null,
    URL: null,
    EMPRESA_CORTA: 'HIDRANDINA',
    ESTADO_FECHA: 'ESTA SEMANA',
    TIPO_SERVICIO: 'MANTENIMIENTO',
  },
  {
    ID: 5,
    NOMENCLATURA: 'CP-SM-3-2025-ELECTROCENTRO-1',
    ENTIDAD: 'ELECTROCENTRO S.A.',
    REGION: 'JUNIN',
    OBJETO: 'Servicio',
    DESCRIPCION: 'Servicio de identificación y reducción de pérdidas técnicas',
    VALOR: 320000,
    MONEDA: 'PEN',
    FECHA_PUB: '2025-01-25',
    VERSION: 4,
    REINICIADO: null,
    URL: null,
    EMPRESA_CORTA: 'ELECTROCENTRO',
    ESTADO_FECHA: 'ESTA SEMANA',
    TIPO_SERVICIO: 'CONSULTORIA',
  },
  {
    ID: 6,
    NOMENCLATURA: 'LP-SM-5-2024-ELSE-1',
    ENTIDAD: 'ELSE - Electro Sur Este S.A.A.',
    REGION: 'CUSCO',
    OBJETO: 'Servicio',
    DESCRIPCION: 'Servicio de supervisión de obras de electrificación rural',
    VALOR: 450000,
    MONEDA: 'PEN',
    FECHA_PUB: '2024-11-10',
    VERSION: 4,
    REINICIADO: null,
    URL: null,
    EMPRESA_CORTA: 'ELSE',
    ESTADO_FECHA: 'ULTIMO TRIMESTRE',
    TIPO_SERVICIO: 'SUPERVISIÓN',
  },
  {
    ID: 7,
    NOMENCLATURA: 'AS-SM-22-2024-ELECTRONOROESTE-1',
    ENTIDAD: 'ELECTRONOROESTE S.A.',
    REGION: 'PIURA',
    OBJETO: 'Bien',
    DESCRIPCION: 'Adquisición de medidores electrónicos inteligentes',
    VALOR: 680000,
    MONEDA: 'PEN',
    FECHA_PUB: '2024-08-05',
    VERSION: 4,
    REINICIADO: null,
    URL: null,
    EMPRESA_CORTA: 'ELECTRONOROESTE',
    ESTADO_FECHA: 'ANTIGUO',
    TIPO_SERVICIO: 'MEDIDORES',
  },
  {
    ID: 8,
    NOMENCLATURA: 'CP-SM-18-2025-OSINERGMIN-1',
    ENTIDAD: 'OSINERGMIN',
    REGION: 'LIMA',
    OBJETO: 'Servicio',
    DESCRIPCION: 'Servicio de consultoría para estudios tarifarios',
    VALOR: 890000,
    MONEDA: 'PEN',
    FECHA_PUB: '2025-01-28',
    VERSION: 4,
    REINICIADO: null,
    URL: null,
    EMPRESA_CORTA: 'OSINERGMIN',
    ESTADO_FECHA: 'ESTA SEMANA',
    TIPO_SERVICIO: 'ESTUDIOS',
  },
];

export function useDatosPrueba(): boolean {
  return !API_BASE_URL;
}

// ==================== GRUPOS HISTÓRICOS ====================

export async function getGruposHistoricos(): Promise<GrupoHistorico[]> {
  return fetchAPI<GrupoHistorico[]>('getGruposHistoricos');
}

export async function getGrupoHistorico(idGrupo: string): Promise<GrupoHistorico | null> {
  const result = await fetchAPI<{ grupo: GrupoHistorico | null }>('getGrupoHistorico', { idGrupo });
  return result.grupo;
}

export async function getGrupoByNomenclatura(nomenclatura: string): Promise<GrupoHistorico | null> {
  const result = await fetchAPI<{ grupo: GrupoHistorico | null }>('getGrupoByNomenclatura', { nomenclatura });
  return result.grupo;
}

export async function crearGrupoHistorico(
  nomenclaturaActual: string,
  nomenclaturasHistoricos: string[],
  entidad?: string,
  notas?: string
): Promise<{ success: boolean; idGrupo?: string; carpetaUrl?: string; error?: string }> {
  return fetchAPI<{ success: boolean; idGrupo?: string; carpetaUrl?: string; error?: string }>(
    'crearGrupoHistorico',
    {},
    'POST',
    {
      nomenclaturaActual,
      nomenclaturasHistoricos: JSON.stringify(nomenclaturasHistoricos),
      entidad,
      notas
    }
  );
}

export async function updateGrupoHistorico(
  idGrupo: string,
  nomenclaturasHistoricos?: string[],
  notas?: string
): Promise<{ success: boolean }> {
  return fetchAPI<{ success: boolean }>(
    'updateGrupoHistorico',
    {},
    'POST',
    {
      idGrupo,
      nomenclaturasHistoricos: nomenclaturasHistoricos ? JSON.stringify(nomenclaturasHistoricos) : undefined,
      notas
    }
  );
}

export async function deleteGrupoHistorico(idGrupo: string): Promise<{ success: boolean }> {
  return fetchAPI<{ success: boolean }>(
    'deleteGrupoHistorico',
    {},
    'POST',
    { idGrupo }
  );
}

// ==================== DRIVE GRUPOS ====================

export async function crearCarpetaGrupoHistorico(
  nomenclaturaActual: string,
  entidad: string,
  historicosPorAño: Record<string, string[]>
): Promise<{ success: boolean; url?: string; error?: string }> {
  return fetchAPI<{ success: boolean; url?: string; error?: string }>(
    'crearCarpetaGrupoHistorico',
    {},
    'POST',
    {
      nomenclaturaActual,
      entidad,
      historicosPorAño: JSON.stringify(historicosPorAño)
    }
  );
}

export async function migrarCarpetaExistente(
  nomenclatura: string
): Promise<{ success: boolean; url?: string; migrado?: boolean; error?: string }> {
  return fetchAPI<{ success: boolean; url?: string; migrado?: boolean; error?: string }>(
    'migrarCarpetaExistente',
    {},
    'POST',
    { nomenclatura }
  );
}

// ==================== SEACE SCRAPING ====================

export async function getDatosSeace(nomenclatura: string): Promise<DatosSeace | null> {
  const result = await fetchAPI<{ datos: DatosSeace | null }>('getDatosSeace', { nomenclatura });
  return result.datos;
}

export async function getEstadoScraping(nomenclatura: string): Promise<{
  estado: 'SUCCESS' | 'ERROR' | 'PENDING' | 'NO_SCRAPEADO';
  fechaScraping: string | null;
  error: string | null;
}> {
  return fetchAPI<{
    estado: 'SUCCESS' | 'ERROR' | 'PENDING' | 'NO_SCRAPEADO';
    fechaScraping: string | null;
    error: string | null;
  }>('getEstadoScraping', { nomenclatura });
}

export async function scrapeProceso(
  nomenclatura: string,
  url?: string
): Promise<{ success: boolean; datos?: DatosSeace; error?: string }> {
  return fetchAPI<{ success: boolean; datos?: DatosSeace; error?: string }>(
    'scrapeProceso',
    {},
    'POST',
    { nomenclatura, url }
  );
}

// ==================== OCDS API ====================

// ==================== OCDS API ====================
// Estas interfaces coinciden con la estructura REAL retornada por GOOGLE_APPS_SCRIPT.js
// Función _transformarRecord (líneas 1960-2062)

export interface PostorOCDS {
  ruc: string;
  nombre: string;
  esGanador: boolean;
}

export interface DocumentoOCDS {
  titulo: string;
  tipo: string;
  formato: string;
  url: string;
  fecha?: string;
}

export interface GanadorOCDS {
  ruc: string;
  nombre: string;
}

export interface ContratoOCDS {
  numero: string;
  monto: number;
  moneda: string;
  fechaFirma: string;
  inicio: string;
  fin: string;
  duracionDias: number;
}

export interface EntidadOCDS {
  nombre: string;
  ruc: string;
  direccion: string;
  departamento: string;
  telefono: string;
}

export interface CronogramaOCDS {
  convocatoriaInicio: string;
  convocatoriaFin: string;
  consultasInicio: string;
  consultasFin: string;
  buenaPro: string;
}

export interface ItemOCDS {
  numero: number;
  descripcion: string;
  cantidad: number;
  unidad: string;
  clasificacion: string;
}

// La respuesta REAL del backend (estructura PLANA, no anidada)
export interface DatosProcesoOCDS {
  ocid: string;
  tenderId: string;
  nomenclatura: string;
  descripcion: string;
  tipoProcedimiento: string; // Ej: "Adjudicación Simplificada"
  metodo: string; // Ej: "open", "selective"
  categoria: string; // mainProcurementCategory: "goods", "services", "works"
  valorReferencial: number;
  moneda: string;
  fechaPublicacion: string;
  cronograma: CronogramaOCDS;
  entidad: EntidadOCDS;
  postores: PostorOCDS[];
  numPostores: number;
  ganador: GanadorOCDS | null;
  montoAdjudicado: number | null;
  contrato: ContratoOCDS | null;
  documentos: DocumentoOCDS[];
  numDocumentos: number;
  items: ItemOCDS[];
  numItems: number;
}

// Obtener proceso OCDS por nomenclatura (usa el índice + API en tiempo real)
export async function getProcesoOCDS(nomenclatura: string): Promise<DatosProcesoOCDS | null> {
  const result = await fetchAPI<{ success: boolean; datos?: DatosProcesoOCDS; error?: string }>(
    'getProcesoOCDS',
    { nomenclatura }
  );
  return result.success ? result.datos || null : null;
}

// Obtener proceso OCDS directamente por tender_id
export async function getByTenderId(tenderId: string): Promise<DatosProcesoOCDS | null> {
  const result = await fetchAPI<{ success: boolean; datos?: DatosProcesoOCDS; error?: string }>(
    'getByTenderId',
    { tenderId }
  );
  return result.success ? result.datos || null : null;
}

// Obtener proceso OCDS directamente por OCID
export async function getByOcid(ocid: string): Promise<DatosProcesoOCDS | null> {
  const result = await fetchAPI<{ success: boolean; datos?: DatosProcesoOCDS; error?: string }>(
    'getByOcid',
    { ocid }
  );
  return result.success ? result.datos || null : null;
}

// Obtener solo postores de un proceso
export async function getPostoresOCDS(nomenclatura: string): Promise<PostorOCDS[]> {
  const result = await fetchAPI<{ success: boolean; postores?: PostorOCDS[] }>(
    'getPostoresOCDS',
    { nomenclatura }
  );
  return result.postores || [];
}

// Obtener solo documentos de un proceso
export async function getDocumentosOCDS(nomenclatura: string): Promise<DocumentoOCDS[]> {
  const result = await fetchAPI<{ success: boolean; documentos?: DocumentoOCDS[] }>(
    'getDocumentosOCDS',
    { nomenclatura }
  );
  return result.documentos || [];
}

// Obtener cronograma de un proceso
export async function getCronogramaOCDS(nomenclatura: string): Promise<CronogramaOCDS[]> {
  const result = await fetchAPI<{ success: boolean; cronograma?: CronogramaOCDS[] }>(
    'getCronogramaOCDS',
    { nomenclatura }
  );
  return result.cronograma || [];
}

// Listar todos los procesos del índice OCDS
export async function listarProcesosOCDS(entidad?: string): Promise<ProcesoOCDS[]> {
  const params: Record<string, string> = {};
  if (entidad) params.entidad = entidad;

  const result = await fetchAPI<{ success: boolean; procesos?: ProcesoOCDS[] }>(
    'listarProcesosOCDS',
    params
  );
  return result.procesos || [];
}

// Actualizar el índice OCDS (descarga datos de la API OCDS)
export async function actualizarIndiceOCDS(
  year: number,
  entidad?: string,
  month?: number
): Promise<{ success: boolean; total?: number; mensaje?: string; error?: string }> {
  const params: Record<string, string> = { year: String(year) };
  if (entidad) params.entidad = entidad;
  if (month) params.month = String(month);

  return fetchAPI<{ success: boolean; total?: number; mensaje?: string; error?: string }>(
    'actualizarIndiceOCDS',
    params
  );
}

// Sincronizar un histórico individual con OCDS
export async function sincronizarHistoricoIndividual(
  nomenclatura: string
): Promise<{
  success: boolean;
  etapasActualizadas?: number;
  año?: number;
  linkOSCE?: string;
  mensaje?: string;
  error?: string;
}> {
  return fetchAPI(
    'sincronizarHistoricoIndividual',
    {},
    'POST',
    { nomenclatura }
  );
}

// Sincronizar todos los históricos de un grupo
export async function sincronizarGrupoHistorico(
  nomenclaturaActual: string
): Promise<{
  success: boolean;
  totalHistoricos?: number;
  totalEtapasActualizadas?: number;
  resultados?: Array<{
    nomenclatura: string;
    año?: number;
    etapas?: number;
    success: boolean;
    error?: string;
  }>;
  mensaje?: string;
  error?: string;
}> {
  return fetchAPI(
    'sincronizarGrupoHistorico',
    {},
    'POST',
    { nomenclaturaActual }
  );
}

// ==================== v2.0: EMPRESAS ELÉCTRICAS ====================

export async function getEmpresasElectricas(): Promise<EmpresaElectrica[]> {
  const result = await fetchAPI<{ empresas: EmpresaElectrica[]; total: number }>(
    'getEmpresasElectricas'
  );
  return result.empresas || [];
}

export async function toggleEmpresaElectrica(
  item: number,
  activo: boolean
): Promise<{ success: boolean; mensaje?: string; error?: string }> {
  return fetchAPI<{ success: boolean; mensaje?: string; error?: string }>(
    'toggleEmpresaElectrica',
    {},
    'POST',
    { item: String(item), activo: String(activo) }
  );
}

export async function addEmpresaElectrica(
  nombreCompleto: string,
  nombreCorto: string,
  patronBusqueda: string,
  colorHex: string
): Promise<{ success: boolean; item?: number; mensaje?: string; error?: string }> {
  return fetchAPI<{ success: boolean; item?: number; mensaje?: string; error?: string }>(
    'addEmpresaElectrica',
    {},
    'POST',
    { nombreCompleto, nombreCorto, patronBusqueda, colorHex }
  );
}

// ==================== v2.0: SEGUIMIENTO DETALLE COMPLETO ====================

export async function getSeguimientoDetalleCompleto(
  nomenclatura: string
): Promise<ProcesoDetalleCompleto | null> {
  const result = await fetchAPI<{ proceso: ProcesoDetalleCompleto }>('getSeguimientoDetalleCompleto', {
    nomenclatura,
  });
  return result.proceso || null;
}

// ==================== v2.0: HISTÓRICOS DETALLE ====================

export async function guardarHistoricoExtraidoIA(
  datosExtraidos: DatosHistoricoExtraido
): Promise<{ success: boolean; accion?: string; fila?: number; mensaje?: string; error?: string }> {
  return fetchAPI<{
    success: boolean;
    accion?: string;
    fila?: number;
    mensaje?: string;
    error?: string;
  }>('guardarHistoricoExtraidoIA', {}, 'POST', datosExtraidos as unknown as Record<string, unknown>);
}

export async function getComparativaHistoricos(
  nomenclatura: string
): Promise<ComparativaHistoricos | null> {
  const result = await fetchAPI<{ comparativa: ComparativaHistoricos }>('getComparativaHistoricos', {
    nomenclatura,
  });
  return result.comparativa || null;
}

// ==================== UPLOAD DE ARCHIVOS ====================

// Tipos permitidos para upload
export const TIPOS_ARCHIVO_PERMITIDOS = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/jpeg',
  'image/png',
  'application/zip',
  'application/x-zip-compressed',
];

export const EXTENSIONES_PERMITIDAS = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.jpg', '.jpeg', '.png', '.zip'];

export const TAMAÑO_MAXIMO_MB = 45;
export const TAMAÑO_MAXIMO_BYTES = TAMAÑO_MAXIMO_MB * 1024 * 1024;

/**
 * Convierte un archivo a base64
 */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Remover el prefijo "data:mime/type;base64,"
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = () => reject(new Error('Error al leer el archivo'));
    reader.readAsDataURL(file);
  });
}

/**
 * Valida un archivo antes de subirlo
 */
export function validarArchivo(file: File): { valido: boolean; error?: string } {
  // Validar tamaño
  if (file.size > TAMAÑO_MAXIMO_BYTES) {
    return {
      valido: false,
      error: `El archivo excede el límite de ${TAMAÑO_MAXIMO_MB}MB (${(file.size / 1024 / 1024).toFixed(2)}MB)`,
    };
  }

  // Validar tipo MIME
  if (!TIPOS_ARCHIVO_PERMITIDOS.includes(file.type)) {
    // Verificar por extensión como fallback
    const extension = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!EXTENSIONES_PERMITIDAS.includes(extension)) {
      return {
        valido: false,
        error: `Tipo de archivo no permitido: ${file.type || extension}. Permitidos: PDF, DOC, DOCX, XLS, XLSX, JPG, PNG, ZIP`,
      };
    }
  }

  return { valido: true };
}

/**
 * Sube un archivo a Drive y lo registra/actualiza en la hoja DOCUMENTOS
 * @param documentoDestino - Si se proporciona, actualiza la URL de ese documento existente
 *                           en vez de crear uno nuevo. Debe coincidir con el NOMBRE del documento.
 * @param esHistorico - Si es true, sube a HISTORICOS/{año}/{nomenclatura}/
 * @param añoProceso - Año del proceso (requerido si esHistorico=true)
 */
export async function uploadDocument(
  nomenclatura: string,
  file: File,
  etapa?: EtapaSeace,
  entidad?: string,
  documentoDestino?: string,
  esHistorico?: boolean,
  añoProceso?: string
): Promise<UploadResult> {
  // Validar archivo
  const validacion = validarArchivo(file);
  if (!validacion.valido) {
    return { success: false, error: validacion.error };
  }

  try {
    // Convertir a base64
    const sizeMB = (file.size / 1024 / 1024).toFixed(2);
    console.log(`📤 Subiendo archivo: ${file.name} (${sizeMB}MB)`);
    if (documentoDestino) {
      console.log(`📎 Vinculando con documento: ${documentoDestino}`);
    }
    if (esHistorico) {
      console.log(`📁 Destino: HISTORICOS/${añoProceso}/${nomenclatura}/`);
    }
    const fileData = await fileToBase64(file);

    // Construir URL solo con action
    const url = new URL(API_BASE_URL);
    url.searchParams.set('action', 'uploadAndRegisterDocument');

    // Enviar como POST con body JSON (no como parámetros de URL)
    console.log(`🔗 POST a: ${url.toString()}`);

    // Usar text/plain para evitar preflight CORS (Google Apps Script no maneja OPTIONS)
    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain',
      },
      body: JSON.stringify({
        action: 'uploadAndRegisterDocument',
        nomenclatura,
        fileName: file.name,
        fileData,
        mimeType: file.type || 'application/octet-stream',
        etapa: etapa || '',
        entidad: entidad || '',
        documentoDestino: documentoDestino || '',
        esHistorico: esHistorico || false,
        añoProceso: añoProceso || '',
      }),
      redirect: 'follow',
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const result = await response.json() as UploadResult;

    if (result.success) {
      console.log(`✅ Archivo subido: ${result.viewUrl}`);
      if (documentoDestino) {
        console.log(`✅ Documento "${documentoDestino}" actualizado con el archivo`);
      }
    } else {
      console.error(`❌ Error al subir archivo: ${result.error}`);
    }

    return result;
  } catch (error) {
    console.error('❌ Error en uploadDocument:', error);
    const errorMsg = error instanceof Error ? error.message : 'Error desconocido';

    // Dar mensaje más útil si es error de red
    if (errorMsg.includes('Failed to fetch') || errorMsg.includes('NetworkError')) {
      return {
        success: false,
        error: 'Error de conexión. Verifica que el Apps Script esté desplegado correctamente y vuelve a desplegar con "Nueva implementación".',
      };
    }

    return {
      success: false,
      error: errorMsg,
    };
  }
}

/**
 * Sube un archivo directamente a Drive sin registrar en DOCUMENTOS
 * Usa POST directo para manejar archivos grandes
 */
export async function uploadFileToDrive(
  nomenclatura: string,
  file: File
): Promise<UploadResult> {
  const validacion = validarArchivo(file);
  if (!validacion.valido) {
    return { success: false, error: validacion.error };
  }

  try {
    const fileData = await fileToBase64(file);

    const url = new URL(API_BASE_URL);
    url.searchParams.set('action', 'uploadFileToDrive');

    // Usar text/plain para evitar preflight CORS
    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({
        action: 'uploadFileToDrive',
        nomenclatura,
        fileName: file.name,
        fileData,
        mimeType: file.type || 'application/octet-stream',
      }),
      redirect: 'follow',
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.json() as UploadResult;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Error desconocido';
    return {
      success: false,
      error: errorMsg.includes('Failed to fetch')
        ? 'Error de conexión. Verifica el despliegue del Apps Script.'
        : errorMsg,
    };
  }
}

/**
 * Sube múltiples archivos secuencialmente
 */
export async function uploadMultipleDocuments(
  nomenclatura: string,
  files: File[],
  etapa?: EtapaSeace,
  entidad?: string,
  onProgress?: (completed: number, total: number, fileName: string, success: boolean) => void
): Promise<{ total: number; exitosos: number; fallidos: number; resultados: UploadResult[] }> {
  const resultados: UploadResult[] = [];
  let exitosos = 0;
  let fallidos = 0;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const resultado = await uploadDocument(nomenclatura, file, etapa, entidad);
    resultados.push(resultado);

    if (resultado.success) {
      exitosos++;
    } else {
      fallidos++;
    }

    if (onProgress) {
      onProgress(i + 1, files.length, file.name, resultado.success);
    }
  }

  return {
    total: files.length,
    exitosos,
    fallidos,
    resultados,
  };
}

// ==================== POSTORES ====================

export interface Postor {
  NOMENCLATURA: string;
  RUC: string;
  RAZON_SOCIAL: string;
  REPRESENTANTE?: string;
  ESTADO: 'PARTICIPANTE' | 'GANADOR' | 'DESCALIFICADO' | 'NO_ADMITIDO';
  TIPO_POSTOR?: string;
  ES_MYPE?: boolean;
  MONTO_OFERTADO?: number;
  PUNTAJE?: number;
  NOTAS?: string;
  FECHA_REGISTRO?: string;
}

/**
 * Obtiene los postores de un proceso
 */
export async function getPostores(nomenclatura: string): Promise<Postor[]> {
  return fetchAPI<Postor[]>('getPostores', { nomenclatura });
}

/**
 * Agrega un postor a un proceso
 */
export async function addPostor(
  nomenclatura: string,
  ruc: string,
  razonSocial: string,
  representante?: string,
  estado?: 'PARTICIPANTE' | 'GANADOR' | 'DESCALIFICADO' | 'NO_ADMITIDO',
  tipoPostor?: string,
  esMYPE?: boolean,
  montoOfertado?: number,
  puntaje?: number,
  notas?: string
): Promise<{ success: boolean; ruc?: string; error?: string }> {
  return fetchAPI<{ success: boolean; ruc?: string; error?: string }>(
    'addPostor',
    {},
    'POST',
    {
      nomenclatura,
      ruc,
      razonSocial,
      representante,
      estado: estado || 'PARTICIPANTE',
      tipoPostor,
      esMYPE,
      montoOfertado,
      puntaje,
      notas,
    }
  );
}

/**
 * Actualiza un postor existente
 */
export async function updatePostor(
  nomenclatura: string,
  ruc: string,
  updates: Partial<Omit<Postor, 'NOMENCLATURA' | 'RUC'>>
): Promise<{ success: boolean; error?: string }> {
  return fetchAPI<{ success: boolean; error?: string }>(
    'updatePostor',
    {},
    'POST',
    {
      nomenclatura,
      ruc,
      ...updates,
    }
  );
}

/**
 * Elimina un postor
 */
export async function deletePostor(
  nomenclatura: string,
  ruc: string
): Promise<{ success: boolean; error?: string }> {
  return fetchAPI<{ success: boolean; error?: string }>(
    'deletePostor',
    {},
    'POST',
    { nomenclatura, ruc }
  );
}

// ==================== ENLACES RÁPIDOS ====================

// Enlaces por defecto si la API no tiene configurados
const ENLACES_DEFAULT: EnlaceRapido[] = [
  {
    id: 'base-telcom',
    nombre: 'BASE TELCOM',
    url: 'https://canazachyub.github.io/Telcomdashboard/',
    categoria: 'dashboard',
    icono: 'Database',
    color: '#3b82f6',
    orden: 1,
    activo: true
  },
  {
    id: 'gemini',
    nombre: 'Gemini AI',
    url: 'https://gemini.google.com/app',
    categoria: 'ia',
    icono: 'Sparkles',
    color: '#8b5cf6',
    orden: 2,
    activo: true
  },
  {
    id: 'notebooklm',
    nombre: 'NotebookLM',
    url: 'https://notebooklm.google.com/',
    categoria: 'ia',
    icono: 'BookOpen',
    color: '#10b981',
    orden: 3,
    activo: true
  },
  {
    id: 'chatgpt',
    nombre: 'ChatGPT',
    url: 'https://chatgpt.com/',
    categoria: 'ia',
    icono: 'MessageSquare',
    color: '#059669',
    orden: 4,
    activo: true
  }
];

/**
 * Obtiene los enlaces rápidos configurados
 * Si la API falla o no existe el endpoint, retorna los valores por defecto
 */
export async function getEnlacesRapidos(): Promise<EnlaceRapido[]> {
  try {
    const result = await fetchAPI<{ enlaces: EnlaceRapido[] }>('getEnlacesRapidos');
    if (result.enlaces && result.enlaces.length > 0) {
      return result.enlaces.filter(e => e.activo !== false);
    }
    return ENLACES_DEFAULT;
  } catch {
    // Si la API no tiene el endpoint, usar valores por defecto
    console.log('📎 Usando enlaces rápidos por defecto');
    return ENLACES_DEFAULT;
  }
}
