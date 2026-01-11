import { useState, useEffect, useCallback } from 'react';
import { getDatosSeace, scrapeProceso, getProcesoOCDS } from '../../services/api';
import { Badge } from '../ui/Badge';
import { formatearMoneda, formatearFecha } from '../../utils/constants';
import type { DatosSeace, CronogramaSeace, DocumentoSeace, PostorSeace, OfertaSeace, ItemSeace } from '../../types';
import {
  Database,
  Calendar,
  FileText,
  Users,
  Award,
  Package,
  RefreshCw,
  ExternalLink,
  Clock,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Download,
  Building2,
  DollarSign,
  FileCheck,
  Copy,
  Check
} from 'lucide-react';

interface Props {
  nomenclatura: string;
  onClose?: () => void;
  proceso?: {
    DESCRIPCION?: string;
    ENTIDAD?: string;
    VALOR?: number;
    MONEDA?: string;
    FECHA_PUB?: string | Date;
    REGION?: string;
    OBJETO?: string;
    URL?: string | null;
  };
}

// Parsear nomenclatura para extraer datos de búsqueda
function parseNomenclatura(nomenclatura: string): {
  tipo: string;
  modalidad: string;
  numero: string;
  año: string;
  entidad: string;
  version: string;
} | null {
  const partes = nomenclatura.toUpperCase().split('-');
  if (partes.length < 5) return null;
  return {
    tipo: partes[0],
    modalidad: partes[1],
    numero: partes[2],
    año: partes[3],
    entidad: partes[4],
    version: partes[5] || '1'
  };
}

// URL del buscador público de SEACE
const SEACE_BUSCADOR_URL = 'https://prod2.seace.gob.pe/seacebus-uiwd-pub/buscadorPublico/buscadorPublico.xhtml';

// URL del Google Sheets - hoja OCDS_INDEX
const SHEETS_URL = import.meta.env.VITE_SHEETS_URL || '';

// Copiar texto al portapapeles
async function copiarAlPortapapeles(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    return false;
  }
}

type TabId = 'cronograma' | 'documentos' | 'postores' | 'ofertas' | 'items' | 'contrato';

export function SeaceDataViewer({ nomenclatura, onClose: _onClose, proceso }: Props) {
  const [datos, setDatos] = useState<DatosSeace | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actualizando, setActualizando] = useState(false);
  const [tabActivo, setTabActivo] = useState<TabId>('cronograma');
  const [copiado, setCopiado] = useState(false);

  // Datos parseados de la nomenclatura
  const datosParsed = parseNomenclatura(nomenclatura);

  // Copiar nomenclatura
  const handleCopiar = async () => {
    const exito = await copiarAlPortapapeles(nomenclatura);
    if (exito) {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    }
  };

  // Cargar datos
  const cargarDatos = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const resultado = await getDatosSeace(nomenclatura);
      // Solo establecer datos si el scraping fue exitoso
      if (resultado && resultado.ESTADO_SCRAPING === 'SUCCESS') {
        setDatos(resultado);
      } else if (resultado && resultado.ESTADO_SCRAPING === 'ERROR') {
        setDatos(null);
        setError(resultado.ERROR_MENSAJE || 'Error previo al obtener datos OCDS');
      } else {
        setDatos(null);
      }
    } catch (err) {
      setDatos(null);
      setError('Error al cargar datos');
    } finally {
      setCargando(false);
    }
  }, [nomenclatura]);

  // Actualizar desde múltiples fuentes de datos
  const actualizarDatos = useCallback(async () => {
    setActualizando(true);
    setError(null);

    try {
      // ESTRATEGIA 1: Intentar scraping del portal SEACE
      const resultadoSeace = await scrapeProceso(nomenclatura);
      if (resultadoSeace.success && resultadoSeace.datos) {
        setDatos(resultadoSeace.datos);
        setError(null);
        return;
      }

      // ESTRATEGIA 2: Si falla SEACE, buscar en API OCDS
      const resultadoOCDS = await getProcesoOCDS(nomenclatura);
      if (resultadoOCDS) {
        // Convertir datos OCDS a formato DatosSeace RICO Y COMPLETO
        // El Apps Script YA transformó el JSON OCDS a un objeto estructurado
        const datosOCDS: any = resultadoOCDS;

        // El API OCDS retorna un objeto PLANO con TODA la información
        // Estructura retornada por _transformarRecord (GOOGLE_APPS_SCRIPT.js:1960-2062):
        // - ocid, tenderId, nomenclatura, descripcion, tipoProcedimiento, metodo, categoria
        // - valorReferencial, moneda, fechaPublicacion
        // - cronograma: { convocatoriaInicio, convocatoriaFin, consultasInicio, consultasFin, buenaPro }
        // - entidad: { nombre, ruc, direccion, departamento, telefono }
        // - postores: [{ ruc, nombre, esGanador }], numPostores
        // - ganador: { ruc, nombre }, montoAdjudicado
        // - contrato: { numero, monto, moneda, fechaFirma, inicio, fin, duracionDias }
        // - documentos: [{ titulo, tipo, formato, url, fecha }], numDocumentos
        // - items: [{ numero, descripcion, cantidad, unidad, clasificacion }], numItems

        const cronogramaData = datosOCDS.cronograma || {};
        const entidadData = datosOCDS.entidad || {};
        const ganadorData = datosOCDS.ganador;
        const contratoData = datosOCDS.contrato;
        const itemsData: any[] = datosOCDS.items || [];
        const documentosData: any[] = datosOCDS.documentos || [];
        const postoresData: any[] = datosOCDS.postores || [];

        // Convertir cronograma OCDS a formato SEACE (con fechas reales)
        const cronogramaConvertido: CronogramaSeace[] = [];
        const hoy = new Date();

        // Convocatoria
        if (cronogramaData.convocatoriaInicio || cronogramaData.convocatoriaFin) {
          const inicio = cronogramaData.convocatoriaInicio ? new Date(cronogramaData.convocatoriaInicio) : null;
          const fin = cronogramaData.convocatoriaFin ? new Date(cronogramaData.convocatoriaFin) : null;
          let estado: 'PENDIENTE' | 'EN_CURSO' | 'COMPLETADO' = 'PENDIENTE';
          if (fin && hoy > fin) estado = 'COMPLETADO';
          else if (inicio && hoy >= inicio && fin && hoy <= fin) estado = 'EN_CURSO';

          cronogramaConvertido.push({
            etapa: 'Convocatoria',
            fechaInicio: cronogramaData.convocatoriaInicio || '',
            fechaFin: cronogramaData.convocatoriaFin || '',
            estado: estado
          });
        }

        // Consultas
        if (cronogramaData.consultasInicio || cronogramaData.consultasFin) {
          const inicio = cronogramaData.consultasInicio ? new Date(cronogramaData.consultasInicio) : null;
          const fin = cronogramaData.consultasFin ? new Date(cronogramaData.consultasFin) : null;
          let estado: 'PENDIENTE' | 'EN_CURSO' | 'COMPLETADO' = 'PENDIENTE';
          if (fin && hoy > fin) estado = 'COMPLETADO';
          else if (inicio && hoy >= inicio && fin && hoy <= fin) estado = 'EN_CURSO';

          cronogramaConvertido.push({
            etapa: 'Consultas y Observaciones',
            fechaInicio: cronogramaData.consultasInicio || '',
            fechaFin: cronogramaData.consultasFin || '',
            estado: estado
          });
        }

        // Buena Pro
        if (cronogramaData.buenaPro) {
          cronogramaConvertido.push({
            etapa: 'Buena Pro',
            fechaInicio: cronogramaData.buenaPro,
            fechaFin: cronogramaData.buenaPro,
            estado: 'COMPLETADO'
          });
        }

        // Periodo de Contrato (si existe)
        if (contratoData?.inicio && contratoData?.fin) {
          const inicio = new Date(contratoData.inicio);
          const fin = new Date(contratoData.fin);
          let estado: 'PENDIENTE' | 'EN_CURSO' | 'COMPLETADO' = 'PENDIENTE';

          if (hoy > fin) estado = 'COMPLETADO';
          else if (hoy >= inicio && hoy <= fin) estado = 'EN_CURSO';
          else if (hoy < inicio) estado = 'PENDIENTE';

          cronogramaConvertido.push({
            etapa: `Ejecución del Contrato${contratoData.duracionDias ? ` (${contratoData.duracionDias} días)` : ''}`,
            fechaInicio: contratoData.inicio,
            fechaFin: contratoData.fin,
            estado: estado
          });
        }

        // Convertir documentos (COMPLETO: titulo, tipo, formato, url, fecha)
        const documentosConvertidos: DocumentoSeace[] = documentosData.map(d => ({
          nombre: `${d.titulo || 'Documento'}${d.formato ? ` (${d.formato.toUpperCase()})` : ''}`,
          tipo: d.tipo || d.documentType || 'document',
          fecha: d.fecha || d.datePublished || new Date().toISOString(),
          url: d.url // ¡CRUCIAL! URL completa desde OCDS
        }));

        // Convertir postores (con ganador identificado) - Usar postoresData extraído
        const postoresConvertidos: PostorSeace[] = postoresData.map(p => ({
          ruc: p.ruc || '',
          razonSocial: p.nombre || '',
          representante: '',
          estado: p.esGanador ? 'GANADOR' : 'PARTICIPANTE'
        }));

        // Convertir items (con clasificación completa)
        const itemsConvertidos: ItemSeace[] = itemsData.map(item => ({
          numero: item.numero || 0,
          descripcion: item.descripcion || '',
          cantidad: item.cantidad || 1,
          unidad: item.unidad || 'UND',
          codigoCubso: item.clasificacion || '',
          precioUnitario: 0
        }));

        // Convertir contrato (con fechas y duración)
        let contratoConvertido: any = null;
        if (contratoData) {
          contratoConvertido = {
            ganador: ganadorData?.nombre || contratoData.ganador || '',
            rucGanador: ganadorData?.ruc || '',
            monto: contratoData.monto || (resultadoOCDS as any).montoAdjudicado || 0,
            fechaFirma: contratoData.fechaFirma || new Date().toISOString(),
            numeroContrato: contratoData.numero || '',
            vigencia: contratoData.duracionDias ? `${contratoData.duracionDias} días` : ''
          };
        } else if (ganadorData) {
          // Si no hay contrato pero sí ganador
          contratoConvertido = {
            ganador: ganadorData.nombre || '',
            rucGanador: ganadorData.ruc || '',
            monto: (resultadoOCDS as any).montoAdjudicado || 0,
            fechaFirma: cronogramaData.buenaPro || new Date().toISOString(),
            numeroContrato: '',
            vigencia: ''
          };
        }

        // Construir objeto COMPLETO con TODA la información disponible del OCDS
        const datosConvertidos: DatosSeace = {
          NOMENCLATURA: datosOCDS.nomenclatura || nomenclatura,
          tenderId: datosOCDS.tenderId,
          ocid: datosOCDS.ocid,
          urlSeace: `https://prodapp2.seace.gob.pe/seacebus-uiwd-pub/buscadorPublico/buscadorPublico.xhtml`,
          sourceId: 'seace_v3',
          ESTADO_SCRAPING: 'SUCCESS',
          FECHA_SCRAPING: new Date().toISOString(),

          // ==================== INFORMACIÓN DEL PROCESO ====================
          descripcion: datosOCDS.descripcion,
          objetoContratacion: datosOCDS.categoria, // mainProcurementCategory (goods/services/works)
          valorReferencial: datosOCDS.valorReferencial,
          moneda: datosOCDS.moneda,
          modalidad: datosOCDS.tipoProcedimiento, // Ej: "Adjudicación Simplificada", "Concurso Público"
          sistemaContratacion: datosOCDS.metodo, // Ej: "open", "selective"

          // ==================== ENTIDAD CONVOCANTE ====================
          entidad: entidadData.nombre ? {
            nombre: entidadData.nombre,
            ruc: entidadData.ruc,
            direccion: entidadData.direccion,
            telefono: entidadData.telefono,
            region: entidadData.departamento
          } : undefined,

          // ==================== DATOS DEL PROCESO ====================
          cronograma: cronogramaConvertido,
          documentos: documentosConvertidos,
          postores: postoresConvertidos,
          ofertas: [], // OCDS no tiene ofertas detalladas con puntajes
          items: itemsConvertidos,
          contrato: contratoConvertido,
          acciones: [],
          comite: [],
          consultas: []
        };

        setDatos(datosConvertidos);
        setError(null);
        return;
      }

      // ESTRATEGIA 3: Ninguna fuente tiene datos
      setDatos(null);
      setError(
        'Proceso no encontrado. Se intentó buscar en:\n' +
        '1. Portal SEACE (scraping)\n' +
        '2. API de Contrataciones Abiertas (OCDS)\n\n' +
        'Este proceso podría no estar disponible en ninguna de estas fuentes.'
      );

    } catch (err) {
      setDatos(null);
      setError('Error al buscar el proceso en las fuentes disponibles');
    } finally {
      setActualizando(false);
    }
  }, [nomenclatura]);

  useEffect(() => {
    cargarDatos();
  }, [cargarDatos]);

  const tabs: { id: TabId; label: string; icon: React.ReactNode; count?: number }[] = [
    { id: 'cronograma', label: 'Cronograma', icon: <Calendar size={16} />, count: datos?.cronograma?.length },
    { id: 'documentos', label: 'Documentos', icon: <FileText size={16} />, count: datos?.documentos?.length },
    { id: 'postores', label: 'Postores', icon: <Users size={16} />, count: datos?.postores?.length },
    { id: 'ofertas', label: 'Ofertas', icon: <Award size={16} />, count: datos?.ofertas?.length },
    { id: 'items', label: 'Items', icon: <Package size={16} />, count: datos?.items?.length },
    { id: 'contrato', label: 'Contrato', icon: <FileCheck size={16} />, count: datos?.contrato ? 1 : 0 },
  ];

  if (cargando) {
    return (
      <div className="p-8 flex flex-col items-center justify-center text-gray-500">
        <Loader2 size={32} className="animate-spin mb-3" />
        <p>Cargando datos de SEACE...</p>
      </div>
    );
  }

  return (
    <div className="border border-purple-200 rounded-lg overflow-hidden bg-white">
      {/* Header */}
      <div className="px-4 py-3 bg-purple-50 border-b border-purple-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Database size={20} className="text-purple-600" />
            <div>
              <h3 className="font-semibold text-purple-900">Datos OCDS</h3>
              <p className="text-xs text-purple-600">{nomenclatura}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {datos?.FECHA_SCRAPING && (
              <span className="text-xs text-gray-500">
                Actualizado: {formatearFecha(datos.FECHA_SCRAPING)}
              </span>
            )}
            {/* Botón para abrir SEACE directamente */}
            {(datos?.tenderId || proceso?.URL) && (
              <button
                onClick={() => {
                  // Si tenemos URL del proceso, usarla directamente
                  if (proceso?.URL) {
                    window.open(proceso.URL, '_blank');
                  } else if (datos?.tenderId) {
                    // Construir URL del buscador con el tenderId
                    window.open(SEACE_BUSCADOR_URL, '_blank');
                  }
                }}
                className="flex items-center gap-1 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                title={datos?.tenderId ? `Tender ID: ${datos.tenderId}` : 'Abrir en SEACE'}
              >
                <ExternalLink size={14} />
                Ver en SEACE
              </button>
            )}
            <button
              onClick={actualizarDatos}
              disabled={actualizando}
              className="flex items-center gap-1 px-3 py-1.5 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors"
            >
              {actualizando ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <RefreshCw size={14} />
              )}
              {actualizando ? 'Actualizando...' : 'Actualizar'}
            </button>
          </div>
        </div>
      </div>

      {/* Error message with local data fallback */}
      {error && (
        <div className="p-4">
          <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <div className="flex items-start gap-2 text-amber-800">
              <AlertCircle size={18} className="flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium">Proceso no encontrado</p>
                <p className="text-xs mt-1 text-amber-700 whitespace-pre-line">{error}</p>
                <div className="mt-3 p-2 bg-amber-100 rounded text-xs text-amber-800">
                  <p className="font-semibold mb-1">Fuentes consultadas:</p>
                  <ul className="list-disc list-inside space-y-0.5 ml-1">
                    <li>Portal SEACE (scraping directo)</li>
                    <li>API de Contrataciones Abiertas OCDS (seace_v3, seace_v2)</li>
                  </ul>
                  <p className="mt-2">
                    <strong>Nota:</strong> Algunas entidades aún no publican sus procesos en todas las plataformas.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Mostrar datos locales disponibles */}
          {proceso && (
            <div className="border border-gray-200 rounded-lg p-4">
              <h4 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
                <Database size={16} className="text-gray-500" />
                Datos disponibles (BD local)
              </h4>
              <div className="grid grid-cols-2 gap-3 text-sm">
                {proceso.ENTIDAD && (
                  <div>
                    <span className="text-gray-500">Entidad:</span>
                    <p className="font-medium text-gray-900">{proceso.ENTIDAD}</p>
                  </div>
                )}
                {proceso.VALOR && (
                  <div>
                    <span className="text-gray-500">Valor:</span>
                    <p className="font-medium text-gray-900">
                      {formatearMoneda(proceso.VALOR, proceso.MONEDA)}
                    </p>
                  </div>
                )}
                {proceso.FECHA_PUB && (
                  <div>
                    <span className="text-gray-500">Fecha publicación:</span>
                    <p className="font-medium text-gray-900">{formatearFecha(proceso.FECHA_PUB)}</p>
                  </div>
                )}
                {proceso.REGION && (
                  <div>
                    <span className="text-gray-500">Región:</span>
                    <p className="font-medium text-gray-900">{proceso.REGION}</p>
                  </div>
                )}
                {proceso.OBJETO && (
                  <div>
                    <span className="text-gray-500">Objeto:</span>
                    <p className="font-medium text-gray-900">{proceso.OBJETO}</p>
                  </div>
                )}
              </div>
              {proceso.DESCRIPCION && (
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <span className="text-gray-500 text-sm">Descripción:</span>
                  <p className="text-sm text-gray-700 mt-1">{proceso.DESCRIPCION}</p>
                </div>
              )}

              {/* Sección Ver en SEACE */}
              <div className="mt-4 pt-3 border-t border-gray-100">
                {proceso.URL ? (
                  // Si tenemos URL directa, mostrar botón simple
                  <a
                    href={proceso.URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
                  >
                    <ExternalLink size={16} />
                    Ver en SEACE
                  </a>
                ) : (
                  // Sin URL directa, mostrar instrucciones de búsqueda
                  <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                    <p className="text-sm font-medium text-blue-800 mb-2">Buscar en SEACE Portal</p>

                    {/* Datos para búsqueda */}
                    {datosParsed && (
                      <div className="grid grid-cols-3 gap-2 text-xs mb-3">
                        <div className="bg-white px-2 py-1 rounded border border-blue-100">
                          <span className="text-gray-500">Año:</span>
                          <span className="ml-1 font-semibold text-blue-700">{datosParsed.año}</span>
                        </div>
                        <div className="bg-white px-2 py-1 rounded border border-blue-100">
                          <span className="text-gray-500">Entidad:</span>
                          <span className="ml-1 font-semibold text-blue-700">{datosParsed.entidad}</span>
                        </div>
                        <div className="bg-white px-2 py-1 rounded border border-blue-100">
                          <span className="text-gray-500">Nº:</span>
                          <span className="ml-1 font-semibold text-blue-700">{datosParsed.numero}</span>
                        </div>
                      </div>
                    )}

                    {/* Nomenclatura con botón copiar */}
                    <div className="flex items-center gap-2 mb-3">
                      <code className="flex-1 bg-white px-3 py-2 rounded border border-blue-200 text-sm font-mono text-purple-700">
                        {nomenclatura}
                      </code>
                      <button
                        onClick={handleCopiar}
                        className={`flex items-center gap-1 px-3 py-2 rounded transition-colors text-sm ${
                          copiado
                            ? 'bg-green-100 text-green-700 border border-green-200'
                            : 'bg-white text-gray-600 hover:bg-gray-100 border border-blue-200'
                        }`}
                        title="Copiar nomenclatura"
                      >
                        {copiado ? <Check size={14} /> : <Copy size={14} />}
                        {copiado ? 'Copiado' : 'Copiar'}
                      </button>
                    </div>

                    {/* Botones */}
                    <div className="flex flex-wrap gap-2">
                      <a
                        href={SEACE_BUSCADOR_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
                      >
                        <ExternalLink size={16} />
                        Ir al Buscador SEACE
                      </a>

                      {SHEETS_URL && (
                        <a
                          href={`${SHEETS_URL}/edit#gid=OCDS_INDEX`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm"
                          title="Buscar en índice OCDS (Google Sheets)"
                        >
                          <Database size={16} />
                          Ver en OCDS_INDEX
                        </a>
                      )}
                    </div>
                    <p className="text-xs text-blue-600 mt-2">
                      <strong>Buscador SEACE:</strong> Filtra por año <strong>{datosParsed?.año}</strong> y pega la nomenclatura copiada.
                      {SHEETS_URL && <><br /><strong>OCDS_INDEX:</strong> Busca la nomenclatura con Ctrl+F en la hoja de Google Sheets.</>}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Sección Ver en SEACE cuando no hay datos del proceso */}
          {!proceso && (
            <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
              <p className="text-sm font-medium text-blue-800 mb-2">Buscar en SEACE Portal</p>

              {datosParsed && (
                <div className="grid grid-cols-3 gap-2 text-xs mb-3">
                  <div className="bg-white px-2 py-1 rounded border border-blue-100">
                    <span className="text-gray-500">Año:</span>
                    <span className="ml-1 font-semibold text-blue-700">{datosParsed.año}</span>
                  </div>
                  <div className="bg-white px-2 py-1 rounded border border-blue-100">
                    <span className="text-gray-500">Entidad:</span>
                    <span className="ml-1 font-semibold text-blue-700">{datosParsed.entidad}</span>
                  </div>
                  <div className="bg-white px-2 py-1 rounded border border-blue-100">
                    <span className="text-gray-500">Nº:</span>
                    <span className="ml-1 font-semibold text-blue-700">{datosParsed.numero}</span>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2 mb-3">
                <code className="flex-1 bg-white px-3 py-2 rounded border border-blue-200 text-sm font-mono text-purple-700">
                  {nomenclatura}
                </code>
                <button
                  onClick={handleCopiar}
                  className={`flex items-center gap-1 px-3 py-2 rounded transition-colors text-sm ${
                    copiado
                      ? 'bg-green-100 text-green-700 border border-green-200'
                      : 'bg-white text-gray-600 hover:bg-gray-100 border border-blue-200'
                  }`}
                  title="Copiar nomenclatura"
                >
                  {copiado ? <Check size={14} /> : <Copy size={14} />}
                  {copiado ? 'Copiado' : 'Copiar'}
                </button>
              </div>

              <div className="flex flex-wrap gap-2">
                <a
                  href={SEACE_BUSCADOR_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
                >
                  <ExternalLink size={16} />
                  Ir al Buscador SEACE
                </a>

                {SHEETS_URL && (
                  <a
                    href={`${SHEETS_URL}/edit#gid=OCDS_INDEX`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm"
                    title="Buscar en índice OCDS (Google Sheets)"
                  >
                    <Database size={16} />
                    Ver en OCDS_INDEX
                  </a>
                )}
              </div>
              <p className="text-xs text-blue-600 mt-2">
                <strong>Buscador SEACE:</strong> Filtra por año <strong>{datosParsed?.año}</strong> y pega la nomenclatura copiada.
                {SHEETS_URL && <><br /><strong>OCDS_INDEX:</strong> Usa Ctrl+F para buscar la nomenclatura en la hoja.</>}
              </p>
            </div>
          )}
        </div>
      )}

      {/* No data message */}
      {!datos && !error && (
        <div className="p-6">
          <div className="text-center mb-6">
            <Database size={48} className="mx-auto text-gray-300 mb-3" />
            <p className="text-gray-500 mb-4">No hay datos guardados para este proceso</p>
            <button
              onClick={actualizarDatos}
              disabled={actualizando}
              className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
            >
              {actualizando ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Download size={16} />
              )}
              Buscar en API OCDS
            </button>
            <p className="text-xs text-gray-400 mt-3">
              La API OCDS puede no contener procesos anteriores a 2024
            </p>
          </div>

          {/* Sección buscar en SEACE Portal */}
          <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
            <p className="text-sm font-medium text-blue-800 mb-2">O buscar directamente en SEACE Portal</p>

            {datosParsed && (
              <div className="grid grid-cols-3 gap-2 text-xs mb-3">
                <div className="bg-white px-2 py-1 rounded border border-blue-100">
                  <span className="text-gray-500">Año:</span>
                  <span className="ml-1 font-semibold text-blue-700">{datosParsed.año}</span>
                </div>
                <div className="bg-white px-2 py-1 rounded border border-blue-100">
                  <span className="text-gray-500">Entidad:</span>
                  <span className="ml-1 font-semibold text-blue-700">{datosParsed.entidad}</span>
                </div>
                <div className="bg-white px-2 py-1 rounded border border-blue-100">
                  <span className="text-gray-500">Nº:</span>
                  <span className="ml-1 font-semibold text-blue-700">{datosParsed.numero}</span>
                </div>
              </div>
            )}

            <div className="flex items-center gap-2 mb-3">
              <code className="flex-1 bg-white px-3 py-2 rounded border border-blue-200 text-sm font-mono text-purple-700">
                {nomenclatura}
              </code>
              <button
                onClick={handleCopiar}
                className={`flex items-center gap-1 px-3 py-2 rounded transition-colors text-sm ${
                  copiado
                    ? 'bg-green-100 text-green-700 border border-green-200'
                    : 'bg-white text-gray-600 hover:bg-gray-100 border border-blue-200'
                }`}
                title="Copiar nomenclatura"
              >
                {copiado ? <Check size={14} /> : <Copy size={14} />}
                {copiado ? 'Copiado' : 'Copiar'}
              </button>
            </div>

            <div className="flex flex-wrap gap-2">
              <a
                href={proceso?.URL || SEACE_BUSCADOR_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
              >
                <ExternalLink size={16} />
                {proceso?.URL ? 'Ver en SEACE' : 'Ir al Buscador SEACE'}
              </a>

              {SHEETS_URL && (
                <a
                  href={`${SHEETS_URL}/edit#gid=OCDS_INDEX`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm"
                  title="Buscar en índice OCDS (Google Sheets)"
                >
                  <Database size={16} />
                  Ver en OCDS_INDEX
                </a>
              )}
            </div>
            {!proceso?.URL && (
              <p className="text-xs text-blue-600 mt-2">
                <strong>Buscador SEACE:</strong> Filtra por año <strong>{datosParsed?.año}</strong> y pega la nomenclatura copiada.
                {SHEETS_URL && <><br /><strong>OCDS_INDEX:</strong> Usa Ctrl+F para buscar en la hoja de Google Sheets.</>}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Tabs - Solo mostrar si hay datos OCDS válidos (sin error y con contenido real) */}
      {datos && !error && datos.ESTADO_SCRAPING === 'SUCCESS' && (
        <>
          <div className="flex border-b border-gray-200 overflow-x-auto">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setTabActivo(tab.id)}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  tabActivo === tab.id
                    ? 'border-purple-600 text-purple-600 bg-purple-50'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}
              >
                {tab.icon}
                {tab.label}
                {tab.count !== undefined && tab.count > 0 && (
                  <Badge variant="default" size="sm">{tab.count}</Badge>
                )}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="p-4">
            {tabActivo === 'cronograma' && <CronogramaTab cronograma={datos.cronograma} />}
            {tabActivo === 'documentos' && <DocumentosTab documentos={datos.documentos} />}
            {tabActivo === 'postores' && <PostoresTab postores={datos.postores} />}
            {tabActivo === 'ofertas' && <OfertasTab ofertas={datos.ofertas} />}
            {tabActivo === 'items' && <ItemsTab items={datos.items} />}
            {tabActivo === 'contrato' && <ContratoTab contrato={datos.contrato} />}
          </div>
        </>
      )}
    </div>
  );
}

// ==================== TAB COMPONENTS ====================

function CronogramaTab({ cronograma }: { cronograma: CronogramaSeace[] }) {
  if (!cronograma || cronograma.length === 0) {
    return <EmptyState icon={<Calendar />} message="No hay cronograma disponible" />;
  }

  return (
    <div className="space-y-3">
      {cronograma.map((etapa, index) => (
        <div
          key={index}
          className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg border border-gray-200"
        >
          <div className="flex-shrink-0">
            {etapa.estado === 'COMPLETADO' ? (
              <CheckCircle2 size={20} className="text-green-500" />
            ) : etapa.estado === 'EN_CURSO' ? (
              <Clock size={20} className="text-blue-500" />
            ) : (
              <AlertCircle size={20} className="text-gray-400" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-gray-900">{etapa.etapa}</p>
            <p className="text-sm text-gray-500">
              {formatearFecha(etapa.fechaInicio)} - {formatearFecha(etapa.fechaFin)}
            </p>
          </div>
          <Badge
            variant={
              etapa.estado === 'COMPLETADO' ? 'success' :
              etapa.estado === 'EN_CURSO' ? 'info' : 'default'
            }
            size="sm"
          >
            {etapa.estado}
          </Badge>
        </div>
      ))}
    </div>
  );
}

function DocumentosTab({ documentos }: { documentos: DocumentoSeace[] }) {
  if (!documentos || documentos.length === 0) {
    return <EmptyState icon={<FileText />} message="No hay documentos disponibles" />;
  }

  return (
    <div className="space-y-2">
      {documentos.map((doc, index) => (
        <div
          key={index}
          className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200 hover:bg-gray-100 transition-colors"
        >
          <FileText size={18} className="text-blue-500 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="font-medium text-gray-900 truncate">{doc.nombre}</p>
            <p className="text-xs text-gray-500">
              {doc.tipo} • {formatearFecha(doc.fecha)}
            </p>
          </div>
          {doc.url && (
            <a
              href={doc.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              <ExternalLink size={14} />
              Ver
            </a>
          )}
        </div>
      ))}
    </div>
  );
}

function PostoresTab({ postores }: { postores: PostorSeace[] }) {
  if (!postores || postores.length === 0) {
    return <EmptyState icon={<Users />} message="No hay postores registrados" />;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            <th className="text-left p-3 font-medium text-gray-700">RUC</th>
            <th className="text-left p-3 font-medium text-gray-700">Razón Social</th>
            <th className="text-left p-3 font-medium text-gray-700">Representante</th>
            <th className="text-left p-3 font-medium text-gray-700">Estado</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {postores.map((postor, index) => (
            <tr key={index} className="hover:bg-gray-50">
              <td className="p-3 font-mono text-gray-600">{postor.ruc || '-'}</td>
              <td className="p-3 font-medium text-gray-900">{postor.razonSocial}</td>
              <td className="p-3 text-gray-600">{postor.representante || '-'}</td>
              <td className="p-3">
                {postor.estado && <Badge variant="default" size="sm">{postor.estado}</Badge>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OfertasTab({ ofertas }: { ofertas: OfertaSeace[] }) {
  if (!ofertas || ofertas.length === 0) {
    return <EmptyState icon={<Award />} message="No hay ofertas registradas" />;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            <th className="text-left p-3 font-medium text-gray-700">Postor</th>
            <th className="text-right p-3 font-medium text-gray-700">Monto Ofertado</th>
            <th className="text-right p-3 font-medium text-gray-700">Puntaje Técnico</th>
            <th className="text-right p-3 font-medium text-gray-700">Puntaje Económico</th>
            <th className="text-right p-3 font-medium text-gray-700">Total</th>
            <th className="text-left p-3 font-medium text-gray-700">Estado</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {ofertas.map((oferta, index) => (
            <tr key={index} className="hover:bg-gray-50">
              <td className="p-3">
                <p className="font-medium text-gray-900">{oferta.postor}</p>
                <p className="text-xs text-gray-500">{oferta.ruc}</p>
              </td>
              <td className="p-3 text-right font-semibold text-green-600">
                {formatearMoneda(oferta.montoOfertado)}
              </td>
              <td className="p-3 text-right text-gray-600">
                {oferta.puntajeTecnico?.toFixed(2) || '-'}
              </td>
              <td className="p-3 text-right text-gray-600">
                {oferta.puntajeEconomico?.toFixed(2) || '-'}
              </td>
              <td className="p-3 text-right font-semibold text-purple-600">
                {oferta.puntajeTotal?.toFixed(2) || '-'}
              </td>
              <td className="p-3">
                <Badge
                  variant={oferta.estado === 'active' ? 'success' : 'default'}
                  size="sm"
                >
                  {oferta.estado}
                </Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ItemsTab({ items }: { items: ItemSeace[] }) {
  if (!items || items.length === 0) {
    return <EmptyState icon={<Package />} message="No hay items registrados" />;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            <th className="text-left p-3 font-medium text-gray-700">#</th>
            <th className="text-left p-3 font-medium text-gray-700">Código CUBSO</th>
            <th className="text-left p-3 font-medium text-gray-700">Descripción</th>
            <th className="text-right p-3 font-medium text-gray-700">Cantidad</th>
            <th className="text-left p-3 font-medium text-gray-700">Unidad</th>
            <th className="text-right p-3 font-medium text-gray-700">P. Unitario</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {items.map((item, index) => (
            <tr key={index} className="hover:bg-gray-50">
              <td className="p-3 text-gray-500">{item.numero}</td>
              <td className="p-3 font-mono text-xs text-purple-600">{item.codigoCubso || '-'}</td>
              <td className="p-3 text-gray-900">{item.descripcion}</td>
              <td className="p-3 text-right text-gray-600">{item.cantidad}</td>
              <td className="p-3 text-gray-600">{item.unidad}</td>
              <td className="p-3 text-right font-medium text-gray-900">
                {item.precioUnitario ? formatearMoneda(item.precioUnitario) : '-'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ContratoTab({ contrato }: { contrato: DatosSeace['contrato'] }) {
  if (!contrato) {
    return <EmptyState icon={<FileCheck />} message="No hay contrato adjudicado aún" />;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="p-4 bg-green-50 rounded-lg border border-green-200">
        <div className="flex items-center gap-2 mb-3">
          <Building2 size={18} className="text-green-600" />
          <h4 className="font-semibold text-green-800">Ganador</h4>
        </div>
        <p className="text-lg font-semibold text-gray-900">{contrato.ganador}</p>
        <p className="text-sm text-gray-600">RUC: {contrato.rucGanador}</p>
      </div>

      <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
        <div className="flex items-center gap-2 mb-3">
          <DollarSign size={18} className="text-blue-600" />
          <h4 className="font-semibold text-blue-800">Monto del Contrato</h4>
        </div>
        <p className="text-2xl font-bold text-gray-900">{formatearMoneda(contrato.monto)}</p>
      </div>

      <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
        <div className="flex items-center gap-2 mb-3">
          <Calendar size={18} className="text-gray-600" />
          <h4 className="font-semibold text-gray-800">Fecha de Firma</h4>
        </div>
        <p className="text-lg text-gray-900">{formatearFecha(contrato.fechaFirma)}</p>
      </div>

      <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
        <div className="flex items-center gap-2 mb-3">
          <FileCheck size={18} className="text-gray-600" />
          <h4 className="font-semibold text-gray-800">Número de Contrato</h4>
        </div>
        <p className="text-lg font-mono text-gray-900">{contrato.numeroContrato}</p>
        {contrato.vigencia && (
          <p className="text-sm text-gray-500 mt-1">Vigencia: {contrato.vigencia}</p>
        )}
      </div>
    </div>
  );
}

function EmptyState({ icon, message }: { icon: React.ReactNode; message: string }) {
  return (
    <div className="py-8 text-center text-gray-400">
      <div className="flex justify-center mb-3 opacity-50">
        {icon}
      </div>
      <p className="text-sm">{message}</p>
    </div>
  );
}

// Export compact indicator for table
export function SeaceDataIndicador({ nomenclatura: _nomenclatura, onClick }: { nomenclatura: string; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1 text-purple-600 hover:text-purple-800 transition-colors"
      title="Ver datos OCDS"
    >
      <Database size={14} />
      <span className="text-xs font-medium">OCDS</span>
    </button>
  );
}
