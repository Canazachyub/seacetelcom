// ==================== TIPOS PRINCIPALES ====================

export interface Proceso {
  ID: number;
  NOMENCLATURA: string;
  ENTIDAD: string;
  REGION: string;
  OBJETO: 'Servicio' | 'Bien' | 'Obra' | 'Consultoría de Obra' | string;
  DESCRIPCION: string;
  VALOR: number;
  MONEDA: 'PEN' | 'USD' | string;
  FECHA_PUB: string | Date;
  VERSION: number;
  REINICIADO: string | null;
  URL: string | null;
  // v3.1: Clasificación automática
  EMPRESA_CORTA: string | null;
  ESTADO_FECHA: EstadoFechaProceso | null;
  TIPO_SERVICIO: string | null;
}

// v3.1: Estados de fecha para clasificación temporal
export type EstadoFechaProceso =
  | 'ESTA SEMANA'
  | 'ESTE MES'
  | 'ULTIMO TRIMESTRE'
  | 'ANTIGUO';

export interface Cronograma {
  NOMENCLATURA: string;
  FASE: string;
  INICIO: string | Date;
  FIN: string | Date;
  ESTADO: 'EN_PLAZO' | 'VENCIDO' | 'PENDIENTE';
  ESTADO_CALC?: string;
  DIAS_RESTANTES?: number;
}

// ==================== ETAPAS SEACE ====================

export type EtapaSeace =
  | 'CONVOCATORIA'
  | 'REGISTRO_PARTICIPANTES'
  | 'CONSULTAS_OBSERVACIONES'
  | 'ABSOLUCION_CONSULTAS'
  | 'INTEGRACION_BASES'
  | 'PRESENTACION_PROPUESTAS'
  | 'CALIFICACION_EVALUACION'
  | 'BUENA_PRO';

export type EstadoEtapa = 'PENDIENTE' | 'EN_CURSO' | 'COMPLETADO' | 'VENCIDO' | 'NO_APLICA';

// Datos de una etapa para un año específico
export interface DatosEtapaAño {
  INICIO: string | Date | null;
  FIN: string | Date | null;
  LINK: string; // Link a OSCE/SEACE para ese año
}

// Estructura completa de una etapa con tracking multi-año
export interface DatosEtapa {
  ESTADO: EstadoEtapa;
  NOTAS: string;
  AÑOS: {
    2021: DatosEtapaAño;
    2022: DatosEtapaAño;
    2023: DatosEtapaAño;
    2024: DatosEtapaAño;
    2025: DatosEtapaAño;
  };
}

// ==================== SEGUIMIENTO ====================

export interface Seguimiento {
  NOMENCLATURA: string;
  ESTADO_INTERES: 'PENDIENTE' | 'INSCRITO' | 'DESCARTADO';
  PRIORIDAD: 'ALTA' | 'MEDIA' | 'BAJA';
  NOTAS: string;
  FECHA_AGREGADO?: string | Date;
  CARPETA_DRIVE?: string;
  ENTIDAD?: string;
  VALOR?: number;
  OBJETO?: string;
  FECHA_LIMITE?: string | Date | null;

  // Etapas del proceso
  CONVOCATORIA?: DatosEtapa;
  REGISTRO_PARTICIPANTES?: DatosEtapa;
  CONSULTAS_OBSERVACIONES?: DatosEtapa;
  ABSOLUCION_CONSULTAS?: DatosEtapa;
  INTEGRACION_BASES?: DatosEtapa;
  PRESENTACION_PROPUESTAS?: DatosEtapa;
  CALIFICACION_EVALUACION?: DatosEtapa;
  BUENA_PRO?: DatosEtapa;
}

export interface SeguimientoDetalle extends Seguimiento {
  etapas: Record<EtapaSeace, DatosEtapa>;
}

// ==================== DOCUMENTOS ====================

export interface Documento {
  ID: number;
  NOMENCLATURA: string;
  ETAPA: EtapaSeace;
  TIPO_DOCUMENTO: string;
  NOMBRE_ARCHIVO: string;
  URL_ARCHIVO: string;
  URL_DRIVE?: string;
  FECHA_SUBIDA: string | Date;
  NOTAS: string;
}

export interface FiltroEntidad {
  entidad: string;
  activo: boolean;
}

export interface EntidadUnica {
  entidad: string;
  count: number;
  valor: number;
  regiones: string[];
}

export interface FiltroPalabra {
  palabra: string;
  activo: boolean;
}

// ==================== REGIONES ====================

export type RegionPeru =
  | 'AMAZONAS' | 'ANCASH' | 'APURIMAC' | 'AREQUIPA' | 'AYACUCHO'
  | 'CAJAMARCA' | 'CALLAO' | 'CUSCO' | 'HUANCAVELICA' | 'HUANUCO'
  | 'ICA' | 'JUNIN' | 'LA LIBERTAD' | 'LAMBAYEQUE' | 'LIMA'
  | 'LORETO' | 'MADRE DE DIOS' | 'MOQUEGUA' | 'PASCO' | 'PIURA'
  | 'PUNO' | 'SAN MARTIN' | 'TACNA' | 'TUMBES' | 'UCAYALI';

export interface RegionData {
  count: number;
  valor: number;
}

export type RegionesConProcesos = Record<string, RegionData>;

// ==================== ESTADÍSTICAS ====================

export interface Estadisticas {
  totalProcesos: number;
  porRegion: Record<string, number>;
  porObjeto: Record<string, number>;
  porEntidad: Record<string, number>;
  valorTotal: number;
  topEntidades: [string, number][];
}

// ==================== FILTROS ====================

export interface FiltrosActivos {
  busqueda: string;
  regiones: string[];
  entidades: string[];
  objetos: string[];
  palabrasClave: string[];
  rangoValor: { min: number; max: number } | null;
  rangoFecha: { desde: Date | null; hasta: Date | null };
  // v3.1: Filtros de clasificación automática
  empresasCortas: string[];
  estadosFecha: EstadoFechaProceso[];
  tiposServicio: string[];
}

// ==================== API RESPONSES ====================

export interface APIResponse<T> {
  success?: boolean;
  error?: string;
  data?: T;
}

export interface ProcesosResponse {
  total: number;
  procesos: Proceso[];
}

// ==================== CHAT IA ====================

export interface MensajeChat {
  id: string;
  rol: 'user' | 'assistant';
  contenido: string;
  timestamp: Date;
  procesosRelacionados?: number[]; // IDs de procesos
}

// ==================== UI STATE ====================

export type VistaActiva = 'dashboard' | 'procesos' | 'seguimiento' | 'mapa' | 'ocds';

export interface NotificacionToast {
  id: string;
  tipo: 'success' | 'error' | 'info' | 'warning';
  mensaje: string;
}

// ==================== GRUPOS HISTÓRICOS ====================

export interface GrupoHistorico {
  ID_GRUPO: string;
  NOMENCLATURA_ACTUAL: string;
  NOMENCLATURAS_HISTORICOS: string[];
  FECHA_CREACION: string | Date;
  NOTAS: string;
}

// ==================== DATOS SEACE (SCRAPING) ====================

export interface CronogramaSeace {
  etapa: string;
  fechaInicio: string | Date;
  fechaFin: string | Date;
  estado: string;
}

export interface DocumentoSeace {
  nombre: string;
  tipo: string;
  url: string;
  fecha: string | Date;
}

export interface PostorSeace {
  ruc: string;
  razonSocial: string;
  representante: string;
  estado?: string;
}

export interface ContratoSeace {
  ganador: string;
  rucGanador: string;
  monto: number;
  fechaFirma: string | Date;
  vigencia: string;
  numeroContrato: string;
}

export interface AccionSeace {
  fecha: string | Date;
  accion: string;
  descripcion: string;
  usuario?: string;
}

export interface ItemSeace {
  numero: number;
  codigoCubso: string;
  descripcion: string;
  cantidad: number;
  unidad: string;
  precioUnitario?: number;
}

export interface ConsultaSeace {
  numero: number;
  participante: string;
  fechaConsulta: string | Date;
  consulta: string;
  respuesta: string;
  fechaRespuesta?: string | Date;
}

export interface OfertaSeace {
  postor: string;
  ruc: string;
  montoOfertado: number;
  puntajeTecnico?: number;
  puntajeEconomico?: number;
  puntajeTotal?: number;
  estado: string;
}

export interface IntegranteComite {
  nombre: string;
  cargo: string;
  tipo: 'TITULAR' | 'SUPLENTE';
}

export interface EntidadSeace {
  nombre: string;
  ruc?: string;
  direccion?: string;
  telefono?: string;
  email?: string;
  region?: string;
}

export interface DatosSeace {
  NOMENCLATURA: string;
  FECHA_SCRAPING: string | Date;
  ESTADO_SCRAPING: 'SUCCESS' | 'ERROR' | 'PENDING';
  ERROR_MENSAJE?: string;

  // Metadatos OCDS
  ocid?: string;
  tenderId?: string;
  urlSeace?: string;
  sourceId?: string;

  // Información de la entidad convocante
  entidad?: EntidadSeace;

  // Información del proceso
  descripcion?: string;
  objetoContratacion?: string;
  valorReferencial?: number;
  moneda?: string;
  modalidad?: string;
  sistemaContratacion?: string;

  cronograma: CronogramaSeace[];
  documentos: DocumentoSeace[];
  postores: PostorSeace[];
  contrato: ContratoSeace | null;
  acciones: AccionSeace[];
  items: ItemSeace[];
  comite: IntegranteComite[];
  consultas: ConsultaSeace[];
  ofertas: OfertaSeace[];
}

// ==================== v2.0: EMPRESAS ELÉCTRICAS ====================

export interface EmpresaElectrica {
  item: number;
  nombreCompleto: string;
  nombreCorto: string;
  patronBusqueda: string;
  colorHex: string;
  activo: boolean;
}

// ==================== v2.0: SEGUIMIENTO DETALLE COMPLETO ====================

export interface ProcesoDetalleCompleto {
  nomenclatura: string;
  entidad: string;
  objeto: string;
  region: string;
  valorReferencial: number;
  montoAdjudicado: number;
  estadoInteres: string;
  prioridad: string;
  responsable: string;
  notas: string;
  ganador: {
    ruc: string;
    nombre: string;
    contrato: string;
    fechaContrato: string;
  };
  cronograma: CronogramaEtapa[];
  postores: PostorSeace[];
  comite: IntegranteComite[];
  consultas: ConsultaSeace[];
  acciones: AccionSeace[];
  documentos: Documento[];
  historicos: HistoricoDetalle[];
  linkSeace: string;
  carpetaDrive: string;
}

export interface CronogramaEtapa {
  etapa: string;
  estado: 'PENDIENTE' | 'EN_CURSO' | 'COMPLETADO' | 'VENCIDO';
  fechaInicio: string | Date | null;
  fechaFin: string | Date | null;
  notas: string;
}

// ==================== v2.0: HISTÓRICOS DETALLE ====================

export interface HistoricoDetalle {
  NOMENCLATURA: string;
  AÑO: number;
  ENTIDAD: string;
  OBJETO: string;
  VALOR_REFERENCIAL: number;
  MONTO_ADJUDICADO: number;
  GANADOR_RUC: string;
  GANADOR_NOMBRE: string;
  FECHA_CONVOCATORIA: string | Date;
  FECHA_BUENA_PRO: string | Date;
  NUMERO_CONTRATO: string;
  TOTAL_POSTORES: number;
  LINK_SEACE: string;
  LINK_OSCE: string;
  DOCUMENTOS_JSON: string;
  POSTORES_JSON: string;
  COMITE_JSON: string;
  CONSULTAS_JSON: string;
  FECHA_EXTRACCION: string | Date;
  FUENTE: 'IA' | 'MANUAL' | 'OCDS';
}

export interface ComparativaHistoricos {
  nomenclaturaBase: string;
  totalAños: number;
  historicos: HistoricoDetalle[];
  comparativa: {
    años: number[];
    montos: Array<{
      año: number;
      vr: number;
      adjudicado: number;
      ahorro: number;
    }>;
    ganadores: Array<{
      año: number;
      nombre: string;
      ruc: string;
    }>;
    tendencia: 'CRECIENTE' | 'DECRECIENTE' | 'ESTABLE' | 'SIN_DATOS';
  };
}

export interface DatosHistoricoExtraido {
  // Identificación
  nomenclatura: string;
  año?: number;

  // Entidad - soporta formato plano o anidado
  entidad?: string | {
    nombre: string;
    ruc?: string;
    direccion?: string;
    telefono?: string;
  };
  entidadRuc?: string;

  // Objeto/Descripción
  objeto?: string;
  descripcion?: string;

  // Procedimiento (formato IA)
  procedimiento?: {
    nomenclatura?: string;
    estado?: string;
    tipoSeleccion?: string;
    normativaAplicable?: string;
    versionSEACE?: number;
  };

  // Valores
  valorReferencial?: number;
  valor_referencial?: number;
  montoAdjudicado?: number;
  monto_adjudicado?: number;

  // Ganador - soporta formato plano o anidado
  ganador?: {
    ruc: string;
    nombre: string;
    montoAdjudicado?: number;
    cantidadAdjudicada?: number;
  };
  ganadorRuc?: string;
  ganador_ruc?: string;
  ganadorNombre?: string;
  ganador_nombre?: string;

  // Fechas
  fechaConvocatoria?: string;
  fecha_convocatoria?: string;
  fechaBuenaPro?: string;
  fecha_buena_pro?: string;
  fechaPublicacion?: string;

  // Contrato
  numeroContrato?: string;
  numero_contrato?: string;
  contrato?: {
    numero?: string;
    monto?: number;
    fechaFirma?: string;
  };

  // Postores
  totalPostores?: number;
  total_postores?: number;
  postores?: Array<{
    ruc?: string;
    razonSocial?: string;
    nombre?: string;
    tipoPostor?: string;
    esMYPE?: boolean;
    estado?: string;
    montoAdjudicado?: number;
    cantidadAdjudicada?: number;
  }>;

  // Links
  linkSeace?: string;
  link_seace?: string;
  linkOsce?: string;
  link_osce?: string;
  tender_id?: string;

  // Cronograma
  cronograma?: Array<{
    etapa: string;
    fechaInicio?: string;
    fecha_inicio?: string;
    fechaFin?: string;
    fecha_fin?: string;
    lugar?: string;
  }>;

  // Documentos
  documentos?: Array<{
    numero?: number;
    etapa?: string;
    nombre?: string;
    tipo?: string;
    tamanio?: string;
    fechaPublicacion?: string;
    url?: string;
  }>;

  // Comité de Selección
  comiteSeleccion?: {
    tipo?: string;
    documento?: string;
    fechaEmision?: string;
    integrantes?: Array<{
      numero?: number;
      nombre?: string;
      cargo?: string;
    }>;
  };
  comite?: IntegranteComite[];

  // Consultas y Observaciones
  consultasObservaciones?: Array<{
    ruc?: string;
    razonSocial?: string;
    numeroFormulacion?: number;
    tipo?: string;
    seccion?: string;
    numeral?: string;
    literal?: string;
    pagina?: number;
    fechaEnvio?: string;
    fechaRegistro?: string;
    estado?: string;
  }>;
  consultas?: ConsultaSeace[];

  // Acciones del Procedimiento
  accionesDelProcedimiento?: Array<{
    numero?: number;
    accion?: string;
    fechaHora?: string;
    motivo?: string;
  }>;

  // Acuerdos Comerciales
  acuerdosComerciales?: Array<{
    numero?: number;
    descripcion?: string;
  }>;

  // Cuenta de Pago
  cuentaPago?: {
    banco?: string;
    cuenta?: string;
  };

  // Otros
  codigoCUBSO?: string;
  montoDerechoParticipacion?: string;
  costoReproduccionBases?: number;
  reservaMYPE?: boolean;
  paquete?: boolean;
  estado?: string;

  // Fuente de datos
  fuente?: 'IA' | 'MANUAL' | 'OCDS';
}

// ==================== UPLOAD DE ARCHIVOS ====================

export interface UploadResult {
  success: boolean;
  fileId?: string;
  fileUrl?: string;
  viewUrl?: string;
  downloadUrl?: string;
  fileName?: string;
  mimeType?: string;
  size?: number;
  tipo?: string;
  carpetaUrl?: string;
  registradoEnSheets?: boolean;
  error?: string;
  mensaje?: string;
}

export interface FileUploadRequest {
  nomenclatura: string;
  fileName: string;
  fileData: string; // base64
  mimeType: string;
  etapa?: EtapaSeace;
  entidad?: string;
}

// Enlaces rápidos configurables desde Excel
export interface EnlaceRapido {
  id: string;
  nombre: string;
  url: string;
  categoria: 'herramienta' | 'ia' | 'dashboard' | 'otro';
  icono?: string; // nombre del icono de lucide-react
  color?: string; // color de fondo
  orden?: number;
  activo?: boolean;
}
