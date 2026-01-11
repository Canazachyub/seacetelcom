import React, { useState, useEffect, useRef } from 'react';
import {
  FileText, Users, Calendar, ExternalLink, Upload, RefreshCw,
  Award, AlertCircle, CheckCircle, Clock, Loader, Image as ImageIcon,
  Edit2, Save, X, Plus, ChevronDown, ChevronUp, Info, Eye
} from 'lucide-react';
import * as api from '../../services/api';
import { geminiService } from '../../services/gemini';
import { FileUploader } from '../ui/FileUploader';
import type { ProcesoDetalleCompleto, CronogramaEtapa, UploadResult } from '../../types';

// Función para convertir markdown a HTML con soporte para tablas
function markdownToHtml(markdown: string): string {
  let html = markdown;

  // Procesar tablas markdown primero
  const tableRegex = /(\|.+\|)\n(\|[-:\s|]+\|)\n((?:\|.+\|\n?)+)/g;
  html = html.replace(tableRegex, (_match, headerRow, separatorRow, bodyRows) => {
    // Parsear headers
    const headers = headerRow.split('|').filter((h: string) => h.trim() !== '').map((h: string) => h.trim());

    // Determinar alineación desde el separador
    const alignments = separatorRow.split('|').filter((s: string) => s.trim() !== '').map((s: string) => {
      const trimmed = s.trim();
      if (trimmed.startsWith(':') && trimmed.endsWith(':')) return 'center';
      if (trimmed.endsWith(':')) return 'right';
      return 'left';
    });

    // Parsear filas del cuerpo
    const rows = bodyRows.trim().split('\n').map((row: string) =>
      row.split('|').filter((c: string) => c.trim() !== '').map((c: string) => c.trim())
    );

    // Construir tabla HTML
    let tableHtml = '<div class="overflow-x-auto my-4"><table class="min-w-full border-collapse border border-gray-300 text-sm">';

    // Header
    tableHtml += '<thead class="bg-gray-100"><tr>';
    headers.forEach((header: string, i: number) => {
      const align = alignments[i] || 'left';
      tableHtml += `<th class="border border-gray-300 px-3 py-2 font-semibold text-${align}">${procesarTextoInline(header)}</th>`;
    });
    tableHtml += '</tr></thead>';

    // Body
    tableHtml += '<tbody>';
    rows.forEach((row: string[], rowIndex: number) => {
      const bgClass = rowIndex % 2 === 0 ? 'bg-white' : 'bg-gray-50';
      tableHtml += `<tr class="${bgClass}">`;
      row.forEach((cell: string, i: number) => {
        const align = alignments[i] || 'left';
        tableHtml += `<td class="border border-gray-300 px-3 py-2 text-${align}">${procesarTextoInline(cell)}</td>`;
      });
      tableHtml += '</tr>';
    });
    tableHtml += '</tbody></table></div>';

    return tableHtml;
  });

  // Procesar headers
  html = html.replace(/^## (.+)$/gm, '<h2 class="text-lg font-bold mt-6 mb-3 text-gray-800">$1</h2>');
  html = html.replace(/^### (.+)$/gm, '<h3 class="text-base font-semibold mt-4 mb-2 text-gray-700">$1</h3>');

  // Procesar listas
  html = html.replace(/^- (.+)$/gm, '<li class="ml-4 mb-1">• $1</li>');
  html = html.replace(/(<li[^>]*>.*<\/li>\n?)+/g, '<ul class="my-2">$&</ul>');

  // Procesar párrafos (líneas que no son tablas, headers o listas)
  html = html.replace(/^(?!<[htdul]|<\/|$)(.+)$/gm, '<p class="mb-2">$1</p>');

  // Procesar texto en negrita y emojis
  html = procesarTextoInline(html);

  // Limpiar párrafos vacíos
  html = html.replace(/<p class="mb-2"><\/p>/g, '');
  html = html.replace(/\n{3,}/g, '\n\n');

  return html;
}

function procesarTextoInline(texto: string): string {
  // Negrita
  let result = texto.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  // Emojis con espaciado
  result = result.replace(/(❌|⚠️|✅|📊|🏆|👥|⏱️|📄|🏛️|💰|💡|📈|📉|🔄|✨|📋|🔍|⚡|🎯|📌)/g, '<span class="mr-1">$1</span>');
  return result;
}

interface SeguimientoDetalleCompletoProps {
  nomenclatura: string;
}

export const SeguimientoDetalleCompleto: React.FC<SeguimientoDetalleCompletoProps> = ({ nomenclatura }) => {
  const [proceso, setProceso] = useState<ProcesoDetalleCompleto | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'cronograma' | 'documentos' | 'postores' | 'historicos'>('cronograma');
  const [uploadingIA, setUploadingIA] = useState(false);
  const [selectedImages, setSelectedImages] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Estados de edición
  const [editandoEtapa, setEditandoEtapa] = useState<string | null>(null);
  const [etapaEditData, setEtapaEditData] = useState<CronogramaEtapa | null>(null);
  const [guardando, setGuardando] = useState(false);

  // Estados para documentos
  const [mostrarFormDoc, setMostrarFormDoc] = useState(false);
  const [nuevoDoc, setNuevoDoc] = useState({
    etapa: 'CONVOCATORIA' as any,
    tipoDocumento: '',
    nombreArchivo: '',
    urlArchivo: '',
    urlDrive: '',
    notas: ''
  });

  // Estados para postores
  const [mostrarFormPostor, setMostrarFormPostor] = useState(false);
  const [nuevoPostor, setNuevoPostor] = useState({
    ruc: '',
    razonSocial: '',
    representante: '',
    estado: ''
  });

  // Estados para histórico manual
  const [modoHistorico, setModoHistorico] = useState<'ai' | 'manual' | 'json'>('ai');
  const [historicopManual, setHistoricoManual] = useState({
    año: new Date().getFullYear(),
    entidad: '',
    objeto: '',
    valorReferencial: '',
    montoAdjudicado: '',
    ganadorRuc: '',
    ganadorNombre: '',
    fechaConvocatoria: '',
    fechaBuenaPro: '',
    numeroContrato: '',
    totalPostores: '',
    linkOsce: ''
  });

  // Estados para importar JSON
  const [jsonInput, setJsonInput] = useState('');
  const [nomenclaturaSeleccionada, setNomenclaturaSeleccionada] = useState('');
  const [importandoJson, setImportandoJson] = useState(false);

  // Estados para históricos expandibles
  const [historicoExpandido, setHistoricoExpandido] = useState<string | null>(null);
  const [añoExpandido, setAñoExpandido] = useState<number | null>(null);
  const [tabHistoricoActiva, setTabHistoricoActiva] = useState<'info' | 'documentos' | 'postores' | 'resumen'>('info');

  // Estados para análisis IA
  const [analisisIA, setAnalisisIA] = useState<string>('');
  const [generandoAnalisis, setGenerandoAnalisis] = useState(false);

  useEffect(() => {
    cargarDetalleCompleto();
  }, [nomenclatura]);

  const cargarDetalleCompleto = async () => {
    setLoading(true);
    try {
      const data = await api.getSeguimientoDetalleCompleto(nomenclatura);
      if (data) {
        setProceso(data);
      }
    } catch (error) {
      console.error('Error cargando detalle:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const imageFiles = files.filter(f => f.type.startsWith('image/'));

    if (imageFiles.length === 0) {
      alert('Por favor selecciona solo archivos de imagen');
      return;
    }

    if (imageFiles.length > 3) {
      alert('Máximo 3 imágenes por vez');
      setSelectedImages(imageFiles.slice(0, 3));
    } else {
      setSelectedImages(imageFiles);
    }
  };

  const handleExtractWithIA = async () => {
    if (selectedImages.length === 0) {
      alert('Debes seleccionar al menos una imagen');
      return;
    }

    setUploadingIA(true);

    try {
      console.log('🔍 Iniciando extracción con IA...');
      console.log('📸 Imágenes seleccionadas:', selectedImages.length);

      // Extraer datos usando Gemini Vision
      const datosExtraidos = await geminiService.extraerDatosSEACE(
        selectedImages,
        nomenclatura
      );

      console.log('✅ Datos extraídos por IA:', datosExtraidos);

      // IMPORTANTE: Forzar la nomenclatura base del proceso actual
      // para que el histórico se vincule correctamente
      const añoExtraido = datosExtraidos.año ||
        (datosExtraidos.nomenclatura?.match(/-(\d{4})-/)?.[1] ?
          parseInt(datosExtraidos.nomenclatura.match(/-(\d{4})-/)![1]) :
          new Date().getFullYear());

      // Construir nomenclatura correcta usando base del proceso actual + año extraído
      const nomenclaturaCorregida = nomenclatura.replace(/-\d{4}-/, `-${añoExtraido}-`);

      console.log('🔄 Nomenclatura original extraída:', datosExtraidos.nomenclatura);
      console.log('🔄 Nomenclatura corregida:', nomenclaturaCorregida);
      console.log('🔄 Año extraído:', añoExtraido);

      // Actualizar datos con nomenclatura corregida
      const datosCorregidos = {
        ...datosExtraidos,
        nomenclatura: nomenclaturaCorregida,
        año: añoExtraido
      };

      // Guardar en backend
      console.log('💾 Enviando datos al backend...');
      const resultado = await api.guardarHistoricoExtraidoIA(datosCorregidos);

      console.log('📦 Respuesta del backend:', resultado);

      if (resultado.success) {
        alert(`✅ Datos extraídos y guardados correctamente!\n${resultado.accion === 'actualizado' ? 'Registro actualizado' : 'Nuevo registro agregado'}`);

        // Limpiar selección y recargar datos
        setSelectedImages([]);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
        await cargarDetalleCompleto();
      } else {
        const errorMsg = resultado.error || resultado.mensaje || 'No se pudo guardar';
        console.error('❌ Error del backend:', errorMsg);
        alert(`❌ Error al guardar:\n${errorMsg}`);
      }

    } catch (error: any) {
      console.error('❌ Error completo:', error);

      // Mostrar detalles del error HTTP
      let errorMessage = 'Error al procesar imágenes';

      if (error.message) {
        errorMessage = error.message;
      }

      // Si hay detalles HTTP, mostrarlos
      if (error.status) {
        errorMessage += `\n\nHTTP ${error.status}`;
        if (error.statusText) {
          errorMessage += ` - ${error.statusText}`;
        }
      }

      alert(`❌ Error:\n${errorMessage}\n\nRevisa la consola del navegador (F12) para más detalles.`);
    } finally {
      setUploadingIA(false);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();

    const files = Array.from(e.dataTransfer.files);
    const imageFiles = files.filter(f => f.type.startsWith('image/'));

    if (imageFiles.length === 0) {
      alert('Por favor arrastra solo archivos de imagen');
      return;
    }

    if (imageFiles.length > 3) {
      alert('Máximo 3 imágenes por vez');
      setSelectedImages(imageFiles.slice(0, 3));
    } else {
      setSelectedImages(imageFiles);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const removeImage = (index: number) => {
    setSelectedImages(prev => prev.filter((_, i) => i !== index));
  };

  // Importar datos desde JSON
  const handleImportJSON = async () => {
    if (!nomenclaturaSeleccionada) {
      alert('Selecciona un proceso histórico primero');
      return;
    }
    if (!jsonInput.trim()) {
      alert('Pega el JSON con los datos');
      return;
    }

    setImportandoJson(true);
    try {
      // Parsear JSON
      let datos;
      try {
        datos = JSON.parse(jsonInput);
      } catch {
        alert('❌ JSON inválido. Verifica el formato.');
        setImportandoJson(false);
        return;
      }

      // Extraer año de la nomenclatura seleccionada
      const matchAño = nomenclaturaSeleccionada.match(/-(\d{4})-/);
      const año = matchAño ? parseInt(matchAño[1]) : new Date().getFullYear();

      // Preparar datos para guardar
      const datosParaGuardar = {
        nomenclatura: nomenclaturaSeleccionada,
        año: año,
        entidad: datos.entidad || proceso?.entidad || '',
        objeto: datos.objeto || datos.descripcion || '',
        valorReferencial: datos.valorReferencial || datos.valor_referencial || null,
        montoAdjudicado: datos.montoAdjudicado || datos.monto_adjudicado || null,
        ganadorRuc: datos.ganadorRuc || datos.ganador_ruc || datos.ganador?.ruc || '',
        ganadorNombre: datos.ganadorNombre || datos.ganador_nombre || datos.ganador?.nombre || '',
        fechaConvocatoria: datos.fechaConvocatoria || datos.fecha_convocatoria || '',
        fechaBuenaPro: datos.fechaBuenaPro || datos.fecha_buena_pro || '',
        numeroContrato: datos.numeroContrato || datos.numero_contrato || '',
        totalPostores: datos.totalPostores || datos.total_postores || datos.postores?.length || null,
        linkOsce: datos.linkOsce || datos.link_osce || datos.url || '',
        postores: datos.postores || [],
        documentos: datos.documentos || [],
        fuente: 'MANUAL' as const
      };

      console.log('📦 Importando JSON para:', nomenclaturaSeleccionada, datosParaGuardar);

      const resultado = await api.guardarHistoricoExtraidoIA(datosParaGuardar);

      if (resultado.success) {
        alert(`✅ Datos importados correctamente para ${nomenclaturaSeleccionada}`);
        setJsonInput('');
        setNomenclaturaSeleccionada('');
        await cargarDetalleCompleto();
      } else {
        alert(`❌ Error: ${resultado.error || 'No se pudo guardar'}`);
      }
    } catch (error: any) {
      console.error('Error importando JSON:', error);
      alert(`❌ Error: ${error.message || 'Error desconocido'}`);
    } finally {
      setImportandoJson(false);
    }
  };

  // Obtener nomenclaturas disponibles para importar (del grupo)
  const getNomenclaturasDisponibles = () => {
    if (!proceso?.historicos) return [];
    const nomenclaturas: { nom: string; año: number; tieneDatos: boolean }[] = [];

    proceso.historicos.forEach((h: any) => {
      if (h.NOMENCLATURA) {
        nomenclaturas.push({
          nom: h.NOMENCLATURA,
          año: h.AÑO || 0,
          tieneDatos: !h._SIN_DATOS && (h.GANADOR_NOMBRE || h.MONTO_ADJUDICADO)
        });
      }
    });

    // Ordenar por año descendente
    nomenclaturas.sort((a, b) => b.año - a.año);
    return nomenclaturas;
  };

  // Agrupar históricos por año
  const getHistoricosPorAño = () => {
    if (!proceso?.historicos) return {};
    const porAño: Record<number, any[]> = {};

    proceso.historicos.forEach((h: any) => {
      const año = h.AÑO || 0;
      if (!porAño[año]) porAño[año] = [];
      porAño[año].push(h);
    });

    return porAño;
  };

  // Handlers para edición de etapas
  const iniciarEdicionEtapa = (etapa: CronogramaEtapa) => {
    setEditandoEtapa(etapa.etapa);
    setEtapaEditData({ ...etapa });
  };

  const cancelarEdicion = () => {
    setEditandoEtapa(null);
    setEtapaEditData(null);
  };

  const guardarEtapa = async () => {
    if (!etapaEditData) return;

    setGuardando(true);
    try {
      // Formatear fechas a strings ISO si existen
      const fechaInicioStr = etapaEditData.fechaInicio
        ? (typeof etapaEditData.fechaInicio === 'string'
          ? etapaEditData.fechaInicio
          : etapaEditData.fechaInicio.toISOString())
        : undefined;

      const fechaFinStr = etapaEditData.fechaFin
        ? (typeof etapaEditData.fechaFin === 'string'
          ? etapaEditData.fechaFin
          : etapaEditData.fechaFin.toISOString())
        : undefined;

      await api.updateEtapaSeguimiento(
        nomenclatura,
        etapaEditData.etapa as any,
        etapaEditData.estado as any,
        fechaInicioStr,
        fechaFinStr,
        etapaEditData.notas
      );

      // Recargar datos y cerrar edición
      await cargarDetalleCompleto();
      setEditandoEtapa(null);
      setEtapaEditData(null);
    } catch (error) {
      console.error('Error guardando etapa:', error);
      alert('Error al guardar la etapa');
    } finally {
      setGuardando(false);
    }
  };

  // Handlers para documentos
  const agregarDocumento = async () => {
    if (!nuevoDoc.nombreArchivo || !nuevoDoc.urlArchivo) {
      alert('Nombre de archivo y URL son requeridos');
      return;
    }

    setGuardando(true);
    try {
      await api.addDocumento(
        nomenclatura,
        nuevoDoc.etapa,
        nuevoDoc.tipoDocumento,
        nuevoDoc.nombreArchivo,
        nuevoDoc.urlArchivo,
        nuevoDoc.urlDrive,
        nuevoDoc.notas
      );

      // Resetear form y cerrar
      setNuevoDoc({
        etapa: 'CONVOCATORIA' as any,
        tipoDocumento: '',
        nombreArchivo: '',
        urlArchivo: '',
        urlDrive: '',
        notas: ''
      });
      setMostrarFormDoc(false);
      await cargarDetalleCompleto();
    } catch (error) {
      console.error('Error agregando documento:', error);
      alert('Error al agregar documento');
    } finally {
      setGuardando(false);
    }
  };

  // Handlers para postores
  const agregarPostor = async () => {
    if (!nuevoPostor.ruc || !nuevoPostor.razonSocial) {
      alert('RUC y Razón Social son requeridos');
      return;
    }

    setGuardando(true);
    try {
      const resultado = await api.addPostor(
        nomenclatura,
        nuevoPostor.ruc,
        nuevoPostor.razonSocial,
        nuevoPostor.representante,
        nuevoPostor.estado as 'PARTICIPANTE' | 'GANADOR' | 'DESCALIFICADO' | 'NO_ADMITIDO' || 'PARTICIPANTE'
      );

      if (resultado.success) {
        alert('✅ Postor agregado correctamente');
        setNuevoPostor({
          ruc: '',
          razonSocial: '',
          representante: '',
          estado: ''
        });
        setMostrarFormPostor(false);
        await cargarDetalleCompleto();
      } else {
        alert(`❌ Error: ${resultado.error || 'No se pudo agregar el postor'}`);
      }
    } catch (error) {
      console.error('Error agregando postor:', error);
      alert('Error al agregar postor');
    } finally {
      setGuardando(false);
    }
  };

  // Handler para histórico manual
  const guardarHistoricoManual = async () => {
    if (!historicopManual.año || !historicopManual.entidad) {
      alert('Año y Entidad son campos requeridos');
      return;
    }

    setGuardando(true);
    try {
      const datosHistorico = {
        nomenclatura,
        año: historicopManual.año,
        entidad: historicopManual.entidad,
        objeto: historicopManual.objeto,
        valor_referencial: historicopManual.valorReferencial ? parseFloat(historicopManual.valorReferencial) : undefined,
        monto_adjudicado: historicopManual.montoAdjudicado ? parseFloat(historicopManual.montoAdjudicado) : undefined,
        ganador_ruc: historicopManual.ganadorRuc,
        ganador_nombre: historicopManual.ganadorNombre,
        fecha_convocatoria: historicopManual.fechaConvocatoria,
        fecha_buena_pro: historicopManual.fechaBuenaPro,
        numero_contrato: historicopManual.numeroContrato,
        total_postores: historicopManual.totalPostores ? parseInt(historicopManual.totalPostores) : undefined,
        link_osce: historicopManual.linkOsce,
        fuente: 'MANUAL' as const
      };

      const resultado = await api.guardarHistoricoExtraidoIA(datosHistorico);

      if (resultado.success) {
        alert(`✅ Histórico guardado correctamente!\n${resultado.accion === 'actualizado' ? 'Registro actualizado' : 'Nuevo registro agregado'}`);

        // Resetear form
        setHistoricoManual({
          año: new Date().getFullYear(),
          entidad: '',
          objeto: '',
          valorReferencial: '',
          montoAdjudicado: '',
          ganadorRuc: '',
          ganadorNombre: '',
          fechaConvocatoria: '',
          fechaBuenaPro: '',
          numeroContrato: '',
          totalPostores: '',
          linkOsce: ''
        });
        setModoHistorico('ai');
        await cargarDetalleCompleto();
      } else {
        alert(`❌ Error: ${resultado.error || 'No se pudo guardar'}`);
      }
    } catch (error: any) {
      console.error('Error guardando histórico manual:', error);
      alert(`❌ Error: ${error.message || 'Error al guardar'}`);
    } finally {
      setGuardando(false);
    }
  };

  // Generar análisis comparativo con IA
  const generarAnalisisComparativo = async () => {
    if (!proceso?.historicos || proceso.historicos.length === 0) {
      alert('No hay históricos para analizar');
      return;
    }

    setGenerandoAnalisis(true);
    setAnalisisIA('');

    try {
      console.log('🤖 Generando análisis comparativo con IA...');
      const historicosConDatos = proceso.historicos.filter((h: any) => !h._SIN_DATOS);

      if (historicosConDatos.length === 0) {
        setAnalisisIA('⚠️ No hay históricos con datos para analizar. Importa datos primero.');
        return;
      }

      const analisis = await geminiService.generarAnalisisComparativoHistoricos(historicosConDatos);
      setAnalisisIA(analisis);
      console.log('✅ Análisis generado correctamente');
    } catch (error: any) {
      console.error('Error generando análisis:', error);
      setAnalisisIA(`❌ Error al generar el análisis: ${error.message || 'Error desconocido'}`);
    } finally {
      setGenerandoAnalisis(false);
    }
  };

  const formatearFecha = (fecha: string | Date | null | undefined): string => {
    if (!fecha) return '-';
    const date = typeof fecha === 'string' ? new Date(fecha) : fecha;
    return date.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const getEstadoIcon = (estado: string) => {
    switch (estado) {
      case 'COMPLETADO': return <CheckCircle className="text-green-500" size={16} />;
      case 'EN_CURSO': return <Clock className="text-yellow-500" size={16} />;
      case 'VENCIDO': return <AlertCircle className="text-red-500" size={16} />;
      default: return <Clock className="text-gray-400" size={16} />;
    }
  };

  if (loading) {
    return <div className="animate-pulse p-4">Cargando detalle completo...</div>;
  }

  if (!proceso) {
    return <div className="p-4 text-red-500">No se pudo cargar el proceso</div>;
  }

  return (
    <div className="bg-white rounded-lg shadow-lg overflow-hidden">
      {/* Header con información principal */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-800 text-white p-4">
        <div className="flex justify-between items-start">
          <div>
            <h2 className="text-xl font-bold">{proceso.nomenclatura}</h2>
            <p className="text-blue-100 text-sm mt-1">{proceso.entidad}</p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold">
              S/ {proceso.montoAdjudicado?.toLocaleString() || proceso.valorReferencial?.toLocaleString()}
            </div>
            <div className="text-blue-200 text-xs">
              {proceso.montoAdjudicado ? 'Monto Adjudicado' : 'Valor Referencial'}
            </div>
          </div>
        </div>
        <p className="mt-2 text-sm text-blue-100">{proceso.objeto}</p>
      </div>

      {/* Tabs de navegación */}
      <div className="border-b flex">
        {[
          { key: 'cronograma', icon: Calendar, label: 'Cronograma' },
          { key: 'documentos', icon: FileText, label: 'Documentos' },
          { key: 'postores', icon: Users, label: 'Postores' },
          { key: 'historicos', icon: RefreshCw, label: 'Históricos' }
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as any)}
            className={`px-4 py-3 text-sm font-medium transition-colors ${activeTab === tab.key
              ? 'border-b-2 border-blue-500 text-blue-600'
              : 'text-gray-500 hover:text-gray-700'
              }`}
          >
            <tab.icon className="inline mr-1" size={14} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Contenido de tabs */}
      <div className="p-4">
        {/* Tab: Cronograma */}
        {activeTab === 'cronograma' && (
          <div className="space-y-2">
            {proceso.cronograma.map((etapa, idx) => (
              <div key={etapa.etapa}>
                {editandoEtapa === etapa.etapa && etapaEditData ? (
                  // Modo edición
                  <div className="p-4 bg-blue-50 border-2 border-blue-300 rounded-lg">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold">
                        {idx + 1}
                      </span>
                      <h4 className="font-semibold text-blue-900">
                        Editando: {etapa.etapa.replace(/_/g, ' ')}
                      </h4>
                    </div>

                    <div className="grid grid-cols-2 gap-3 mb-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Estado
                        </label>
                        <select
                          value={etapaEditData.estado}
                          onChange={(e) =>
                            setEtapaEditData({
                              ...etapaEditData,
                              estado: e.target.value as any
                            })
                          }
                          className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="PENDIENTE">Pendiente</option>
                          <option value="EN_CURSO">En Curso</option>
                          <option value="COMPLETADO">Completado</option>
                          <option value="VENCIDO">Vencido</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Fecha Inicio
                        </label>
                        <input
                          type="date"
                          value={
                            etapaEditData.fechaInicio
                              ? typeof etapaEditData.fechaInicio === 'string'
                                ? etapaEditData.fechaInicio.split('T')[0]
                                : etapaEditData.fechaInicio.toISOString().split('T')[0]
                              : ''
                          }
                          onChange={(e) =>
                            setEtapaEditData({
                              ...etapaEditData,
                              fechaInicio: e.target.value || null
                            })
                          }
                          className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Fecha Fin
                        </label>
                        <input
                          type="date"
                          value={
                            etapaEditData.fechaFin
                              ? typeof etapaEditData.fechaFin === 'string'
                                ? etapaEditData.fechaFin.split('T')[0]
                                : etapaEditData.fechaFin.toISOString().split('T')[0]
                              : ''
                          }
                          onChange={(e) =>
                            setEtapaEditData({
                              ...etapaEditData,
                              fechaFin: e.target.value || null
                            })
                          }
                          className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500"
                        />
                      </div>

                      <div className="col-span-2">
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Notas
                        </label>
                        <textarea
                          value={etapaEditData.notas || ''}
                          onChange={(e) =>
                            setEtapaEditData({
                              ...etapaEditData,
                              notas: e.target.value
                            })
                          }
                          rows={2}
                          className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500"
                          placeholder="Notas adicionales..."
                        />
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={guardarEtapa}
                        disabled={guardando}
                        className="flex items-center gap-1 px-3 py-2 bg-green-500 text-white rounded text-sm hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {guardando ? (
                          <>
                            <Loader className="animate-spin" size={14} />
                            Guardando...
                          </>
                        ) : (
                          <>
                            <Save size={14} />
                            Guardar
                          </>
                        )}
                      </button>
                      <button
                        onClick={cancelarEdicion}
                        disabled={guardando}
                        className="flex items-center gap-1 px-3 py-2 bg-gray-300 text-gray-700 rounded text-sm hover:bg-gray-400 disabled:opacity-50"
                      >
                        <X size={14} />
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  // Modo visualización
                  <div
                    className={`flex items-center justify-between p-3 rounded-lg ${
                      etapa.estado === 'COMPLETADO' ? 'bg-green-50' :
                      etapa.estado === 'EN_CURSO' ? 'bg-yellow-50' :
                      etapa.estado === 'VENCIDO' ? 'bg-red-50' : 'bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center gap-3 flex-1">
                      <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold">
                        {idx + 1}
                      </span>
                      <div className="flex-1">
                        <div className="font-medium text-sm">
                          {etapa.etapa.replace(/_/g, ' ')}
                        </div>
                        <div className="text-xs text-gray-500">
                          {formatearFecha(etapa.fechaInicio)} {etapa.fechaFin ? `- ${formatearFecha(etapa.fechaFin)}` : ''}
                        </div>
                        {etapa.notas && (
                          <div className="text-xs text-gray-400 italic">{etapa.notas}</div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {getEstadoIcon(etapa.estado)}
                      <button
                        onClick={() => iniciarEdicionEtapa(etapa)}
                        className="p-1 hover:bg-white rounded transition-colors"
                        title="Editar etapa"
                      >
                        <Edit2 className="text-blue-500" size={16} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Tab: Documentos */}
        {activeTab === 'documentos' && (
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <h4 className="font-medium text-gray-700">Documentos del Proceso</h4>
              <button
                onClick={() => setMostrarFormDoc(!mostrarFormDoc)}
                className="flex items-center gap-1 px-3 py-1 bg-green-500 text-white rounded text-sm hover:bg-green-600"
              >
                {mostrarFormDoc ? <X size={14} /> : <Plus size={14} />}
                {mostrarFormDoc ? 'Cancelar' : 'Agregar'}
              </button>
            </div>

            {/* Formulario para agregar documento */}
            {mostrarFormDoc && (
              <div className="p-4 bg-green-50 border-2 border-green-300 rounded-lg">
                <h4 className="font-semibold text-green-900 mb-3">Nuevo Documento</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Etapa *
                    </label>
                    <select
                      value={nuevoDoc.etapa}
                      onChange={(e) => setNuevoDoc({ ...nuevoDoc, etapa: e.target.value as any })}
                      className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                    >
                      <option value="CONVOCATORIA">Convocatoria</option>
                      <option value="REGISTRO_PARTICIPANTES">Registro Participantes</option>
                      <option value="CONSULTAS_OBSERVACIONES">Consultas y Observaciones</option>
                      <option value="ABSOLUCION_CONSULTAS">Absolución Consultas</option>
                      <option value="INTEGRACION_BASES">Integración Bases</option>
                      <option value="PRESENTACION_PROPUESTAS">Presentación Propuestas</option>
                      <option value="CALIFICACION_EVALUACION">Calificación Evaluación</option>
                      <option value="BUENA_PRO">Buena Pro</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Tipo de Documento
                    </label>
                    <input
                      type="text"
                      value={nuevoDoc.tipoDocumento}
                      onChange={(e) => setNuevoDoc({ ...nuevoDoc, tipoDocumento: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                      placeholder="Bases, Acta, Adenda..."
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Nombre Archivo *
                    </label>
                    <input
                      type="text"
                      value={nuevoDoc.nombreArchivo}
                      onChange={(e) => setNuevoDoc({ ...nuevoDoc, nombreArchivo: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                      placeholder="documento.pdf"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      URL Archivo *
                    </label>
                    <input
                      type="url"
                      value={nuevoDoc.urlArchivo}
                      onChange={(e) => setNuevoDoc({ ...nuevoDoc, urlArchivo: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                      placeholder="https://..."
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      URL Drive (opcional)
                    </label>
                    <input
                      type="url"
                      value={nuevoDoc.urlDrive}
                      onChange={(e) => setNuevoDoc({ ...nuevoDoc, urlDrive: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                      placeholder="https://drive.google.com/..."
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Notas
                    </label>
                    <input
                      type="text"
                      value={nuevoDoc.notas}
                      onChange={(e) => setNuevoDoc({ ...nuevoDoc, notas: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                      placeholder="Notas adicionales..."
                    />
                  </div>
                </div>
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={agregarDocumento}
                    disabled={guardando}
                    className="flex items-center gap-1 px-3 py-2 bg-green-500 text-white rounded text-sm hover:bg-green-600 disabled:opacity-50"
                  >
                    {guardando ? (
                      <>
                        <Loader className="animate-spin" size={14} />
                        Guardando...
                      </>
                    ) : (
                      <>
                        <Save size={14} />
                        Guardar
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => setMostrarFormDoc(false)}
                    disabled={guardando}
                    className="flex items-center gap-1 px-3 py-2 bg-gray-300 text-gray-700 rounded text-sm hover:bg-gray-400 disabled:opacity-50"
                  >
                    <X size={14} />
                    Cancelar
                  </button>
                </div>
              </div>
            )}

            {/* Subir documentos directamente */}
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <h4 className="font-semibold text-blue-900 mb-3 flex items-center gap-2">
                <Upload size={16} />
                Subir documentos a Drive
              </h4>
              <div className="mb-3">
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Etapa del documento
                </label>
                <select
                  value={nuevoDoc.etapa}
                  onChange={(e) => setNuevoDoc({ ...nuevoDoc, etapa: e.target.value as any })}
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                >
                  <option value="CONVOCATORIA">Convocatoria</option>
                  <option value="REGISTRO_PARTICIPANTES">Registro Participantes</option>
                  <option value="CONSULTAS_OBSERVACIONES">Consultas y Observaciones</option>
                  <option value="ABSOLUCION_CONSULTAS">Absolución Consultas</option>
                  <option value="INTEGRACION_BASES">Integración Bases</option>
                  <option value="PRESENTACION_PROPUESTAS">Presentación Propuestas</option>
                  <option value="CALIFICACION_EVALUACION">Calificación Evaluación</option>
                  <option value="BUENA_PRO">Buena Pro</option>
                </select>
              </div>
              <FileUploader
                nomenclatura={nomenclatura}
                etapa={nuevoDoc.etapa}
                entidad={proceso?.entidad}
                documentosDisponibles={proceso.documentos}
                onUploadComplete={(results: UploadResult[]) => {
                  const exitosos = results.filter(r => r.success).length;
                  if (exitosos > 0) {
                    alert(`${exitosos} documento(s) subido(s) correctamente`);
                    cargarDetalleCompleto();
                  }
                }}
                maxFiles={5}
              />
            </div>

            {/* Lista de documentos */}
            <div className="space-y-2">
              <h4 className="font-medium text-gray-700 mb-2">Documentos registrados ({proceso.documentos.length})</h4>
              {proceso.documentos.length === 0 ? (
                <p className="text-gray-500 text-center py-4">No hay documentos registrados</p>
              ) : (
                proceso.documentos.map((doc: any, idx) => {
                  // Soportar ambos formatos de campos (API puede devolver NOMBRE o NOMBRE_ARCHIVO, etc.)
                  const nombreDoc = doc.NOMBRE || doc.NOMBRE_ARCHIVO || doc.nombre || 'Documento';
                  const tipoDoc = doc.TIPO || doc.TIPO_DOCUMENTO || doc.tipo || '';
                  const etapaDoc = doc.ETAPA || doc.etapa || '';
                  const urlDoc = doc.URL_DRIVE || doc.URL_ARCHIVO || doc.url || '';
                  const notasDoc = doc.NOTAS || doc.notas || '';

                  return (
                    <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100">
                      <div className="flex items-center gap-3">
                        <FileText className="text-blue-500" size={20} />
                        <div>
                          <div className="font-medium text-sm">{nombreDoc}</div>
                          <div className="text-xs text-gray-500">{etapaDoc || tipoDoc || '-'}</div>
                          {notasDoc && (
                            <div className="text-xs text-gray-400 italic">{notasDoc}</div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {urlDoc && (
                          <a href={urlDoc} target="_blank" rel="noopener noreferrer"
                            className="p-1 hover:bg-blue-100 rounded text-blue-500 hover:text-blue-700"
                            title="Ver documento">
                            <Eye size={18} />
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* Tab: Postores */}
        {activeTab === 'postores' && (
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <h4 className="font-medium text-gray-700">Postores y Participantes</h4>
              <button
                onClick={() => setMostrarFormPostor(!mostrarFormPostor)}
                className="flex items-center gap-1 px-3 py-1 bg-green-500 text-white rounded text-sm hover:bg-green-600"
              >
                {mostrarFormPostor ? <X size={14} /> : <Plus size={14} />}
                {mostrarFormPostor ? 'Cancelar' : 'Agregar'}
              </button>
            </div>

            {/* Formulario para agregar postor */}
            {mostrarFormPostor && (
              <div className="p-4 bg-green-50 border-2 border-green-300 rounded-lg">
                <h4 className="font-semibold text-green-900 mb-3">Nuevo Postor</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      RUC *
                    </label>
                    <input
                      type="text"
                      value={nuevoPostor.ruc}
                      onChange={(e) => setNuevoPostor({ ...nuevoPostor, ruc: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                      placeholder="20123456789"
                      maxLength={11}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Razón Social *
                    </label>
                    <input
                      type="text"
                      value={nuevoPostor.razonSocial}
                      onChange={(e) => setNuevoPostor({ ...nuevoPostor, razonSocial: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                      placeholder="Empresa SAC"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Representante
                    </label>
                    <input
                      type="text"
                      value={nuevoPostor.representante}
                      onChange={(e) => setNuevoPostor({ ...nuevoPostor, representante: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                      placeholder="Nombre del representante"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Estado
                    </label>
                    <select
                      value={nuevoPostor.estado}
                      onChange={(e) => setNuevoPostor({ ...nuevoPostor, estado: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                    >
                      <option value="">Seleccionar...</option>
                      <option value="PARTICIPANTE">Participante</option>
                      <option value="DESCALIFICADO">Descalificado</option>
                      <option value="NO_ADMITIDO">No Admitido</option>
                    </select>
                  </div>
                </div>
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={agregarPostor}
                    disabled={guardando}
                    className="flex items-center gap-1 px-3 py-2 bg-green-500 text-white rounded text-sm hover:bg-green-600 disabled:opacity-50"
                  >
                    {guardando ? (
                      <>
                        <Loader className="animate-spin" size={14} />
                        Guardando...
                      </>
                    ) : (
                      <>
                        <Save size={14} />
                        Guardar
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => setMostrarFormPostor(false)}
                    disabled={guardando}
                    className="flex items-center gap-1 px-3 py-2 bg-gray-300 text-gray-700 rounded text-sm hover:bg-gray-400 disabled:opacity-50"
                  >
                    <X size={14} />
                    Cancelar
                  </button>
                </div>
              </div>
            )}

            {/* Subir documentos de postores */}
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <h4 className="font-semibold text-blue-900 mb-3 flex items-center gap-2">
                <Upload size={16} />
                Subir documentos de postores
              </h4>
              <FileUploader
                nomenclatura={nomenclatura}
                etapa="PRESENTACION_PROPUESTAS"
                entidad={proceso?.entidad}
                onUploadComplete={(results: UploadResult[]) => {
                  const exitosos = results.filter(r => r.success).length;
                  if (exitosos > 0) {
                    alert(`${exitosos} archivo(s) subido(s) correctamente`);
                    cargarDetalleCompleto();
                  }
                }}
                maxFiles={3}
                compact
              />
            </div>

            {/* Ganador destacado */}
            {proceso.ganador?.nombre && (
              <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                <div className="flex items-center gap-2 text-green-700 font-bold">
                  <Award size={20} />
                  GANADOR
                </div>
                <div className="mt-2">
                  <div className="font-medium">{proceso.ganador.nombre}</div>
                  <div className="text-sm text-gray-600">RUC: {proceso.ganador.ruc}</div>
                  {proceso.ganador.contrato && (
                    <div className="text-sm text-gray-600">
                      Contrato: {proceso.ganador.contrato} | {proceso.ganador.fechaContrato}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Lista de postores */}
            {proceso.postores && proceso.postores.length > 0 ? (
              <div className="space-y-2">
                <h4 className="font-medium text-gray-700">Otros Participantes ({proceso.postores.length}):</h4>
                {proceso.postores.map((postor, idx) => (
                  <div key={idx} className="p-3 bg-gray-50 rounded-lg hover:bg-gray-100">
                    <div className="font-medium text-sm">{postor.razonSocial || 'Postor'}</div>
                    <div className="text-xs text-gray-500">RUC: {postor.ruc}</div>
                    {postor.representante && (
                      <div className="text-xs text-gray-400">Rep: {postor.representante}</div>
                    )}
                    {postor.estado && (
                      <div className="text-xs text-gray-400">Estado: {postor.estado}</div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-center py-4">No hay postores registrados</p>
            )}
          </div>
        )}

        {/* Tab: Históricos - COMPARATIVA MULTI-AÑO */}
        {activeTab === 'historicos' && (
          <div>
            <div className="flex justify-between items-center mb-4">
              <h4 className="font-medium text-gray-700">Comparativa Multi-Año</h4>
              <button
                className="flex items-center gap-1 px-3 py-1 bg-blue-500 text-white rounded text-sm hover:bg-blue-600"
                onClick={cargarDetalleCompleto}
              >
                <RefreshCw size={14} />
                Actualizar
              </button>
            </div>

            {/* Tabla Expandible por Años - Agrupada dinámicamente */}
            <div className="space-y-3">
              {(() => {
                const historicosPorAño = getHistoricosPorAño();
                const años = Object.keys(historicosPorAño).map(Number).sort((a, b) => b - a);

                if (años.length === 0) {
                  return (
                    <div className="text-center py-8 text-gray-500">
                      <p>No hay históricos vinculados a este proceso.</p>
                      <p className="text-sm mt-2">Selecciona históricos al crear el grupo de seguimiento.</p>
                    </div>
                  );
                }

                // Helper para parsear JSON seguro
                const parseJSON = (jsonStr: string | undefined) => {
                  if (!jsonStr) return [];
                  try {
                    return JSON.parse(jsonStr);
                  } catch {
                    return [];
                  }
                };

                return años.map(año => {
                  const historicosDelAño = historicosPorAño[año] || [];
                  const isAñoExpanded = añoExpandido === año;

                  return (
                    <div key={año} className="border rounded-lg border-gray-300 bg-white overflow-hidden">
                      {/* Header del Año */}
                      <div
                        className="p-3 bg-gradient-to-r from-blue-50 to-white flex items-center justify-between cursor-pointer hover:bg-blue-100 transition"
                        onClick={() => setAñoExpandido(isAñoExpanded ? null : año)}
                      >
                        <div className="flex items-center gap-3">
                          <div className="font-bold text-xl text-blue-700 w-16">{año}</div>
                          <div className="text-sm text-gray-600">
                            {historicosDelAño.length} proceso{historicosDelAño.length !== 1 ? 's' : ''}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {isAñoExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                        </div>
                      </div>

                      {/* Históricos del año expandido */}
                      {isAñoExpanded && (
                        <div className="border-t border-gray-200">
                          {historicosDelAño.map((hist: any, idx: number) => {
                            const sinDatos = hist._SIN_DATOS;
                            const isHistExpanded = historicoExpandido === hist.NOMENCLATURA;
                            const documentos = parseJSON(hist.DOCUMENTOS_JSON);
                            const postores = parseJSON(hist.POSTORES_JSON);

                            return (
                              <div
                                key={hist.NOMENCLATURA || idx}
                                className={`border-b last:border-b-0 ${sinDatos ? 'bg-amber-50' : 'bg-white'}`}
                              >
                                {/* Fila del proceso */}
                                <div className="p-3 flex items-center justify-between">
                                  <div className="flex-1">
                                    <div className="font-semibold text-sm text-blue-700">
                                      {hist.NOMENCLATURA}
                                      {sinDatos && (
                                        <span className="ml-2 px-2 py-0.5 text-xs bg-amber-200 text-amber-800 rounded">
                                          Sin datos
                                        </span>
                                      )}
                                    </div>
                                    {!sinDatos && (
                                      <>
                                        <div className="font-medium text-sm text-gray-900 mt-1">
                                          {hist.GANADOR_NOMBRE || 'Sin ganador definido'}
                                        </div>
                                        <div className="text-xs text-gray-500">
                                          Monto: {hist.MONTO_ADJUDICADO ? `S/ ${Number(hist.MONTO_ADJUDICADO).toLocaleString()}` : '-'}
                                        </div>
                                      </>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {hist.LINK_OSCE && (
                                      <a
                                        href={hist.LINK_OSCE}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="p-2 text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded"
                                        title="Ver en OSCE"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        <ExternalLink size={16} />
                                      </a>
                                    )}
                                    {/* Botón RESUMEN - Genera análisis IA */}
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setHistoricoExpandido(hist.NOMENCLATURA);
                                        setTabHistoricoActiva('resumen');
                                        // Generar análisis automáticamente si no existe
                                        if (!analisisIA && !generandoAnalisis) {
                                          generarAnalisisComparativo();
                                        }
                                      }}
                                      disabled={generandoAnalisis}
                                      className="flex items-center gap-1 px-3 py-1.5 bg-purple-500 text-white rounded text-sm hover:bg-purple-600 transition font-medium disabled:opacity-50"
                                      title="Ver análisis comparativo generado por IA"
                                    >
                                      {generandoAnalisis ? (
                                        <Loader size={14} className="animate-spin" />
                                      ) : (
                                        <FileText size={14} />
                                      )}
                                      RESUMEN IA
                                    </button>
                                    {!sinDatos && (
                                      <button
                                        onClick={() => setHistoricoExpandido(isHistExpanded ? null : hist.NOMENCLATURA)}
                                        className="flex items-center gap-1 px-3 py-1.5 bg-blue-500 text-white rounded text-sm hover:bg-blue-600 transition"
                                      >
                                        {isHistExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                        {isHistExpanded ? 'Ocultar' : 'Detalles'}
                                      </button>
                                    )}
                                  </div>
                                </div>

                                {/* Detalles expandidos del histórico */}
                                {isHistExpanded && !sinDatos && (
                                  <div className="border-t border-gray-200 bg-gray-50 p-4">
                                    {/* Sub-tabs */}
                                    <div className="flex gap-2 mb-4 border-b border-gray-300">
                                      <button
                                        onClick={() => setTabHistoricoActiva('info')}
                                        className={`px-4 py-2 text-sm font-medium transition ${
                                          tabHistoricoActiva === 'info'
                                            ? 'border-b-2 border-blue-500 text-blue-600'
                                            : 'text-gray-600 hover:text-gray-800'
                                        }`}
                                      >
                                        <Info size={14} className="inline mr-1" />
                                        Información
                                      </button>
                                      <button
                                        onClick={() => setTabHistoricoActiva('documentos')}
                                        className={`px-4 py-2 text-sm font-medium transition ${
                                          tabHistoricoActiva === 'documentos'
                                            ? 'border-b-2 border-blue-500 text-blue-600'
                                            : 'text-gray-600 hover:text-gray-800'
                                        }`}
                                      >
                                        <FileText size={14} className="inline mr-1" />
                                        Documentos ({documentos.length})
                                      </button>
                                      <button
                                        onClick={() => setTabHistoricoActiva('postores')}
                                        className={`px-4 py-2 text-sm font-medium transition ${
                                          tabHistoricoActiva === 'postores'
                                            ? 'border-b-2 border-blue-500 text-blue-600'
                                            : 'text-gray-600 hover:text-gray-800'
                                        }`}
                                      >
                                        <Users size={14} className="inline mr-1" />
                                        Postores ({postores.length})
                                      </button>
                                      <button
                                        onClick={() => {
                                          setTabHistoricoActiva('resumen');
                                          if (!analisisIA && !generandoAnalisis) {
                                            generarAnalisisComparativo();
                                          }
                                        }}
                                        className={`px-4 py-2 text-sm font-medium transition ${
                                          tabHistoricoActiva === 'resumen'
                                            ? 'border-b-2 border-purple-500 text-purple-600'
                                            : 'text-gray-600 hover:text-gray-800'
                                        }`}
                                      >
                                        {generandoAnalisis ? (
                                          <Loader size={14} className="inline mr-1 animate-spin" />
                                        ) : (
                                          <Award size={14} className="inline mr-1" />
                                        )}
                                        Resumen IA
                                      </button>
                                    </div>

                                    {/* Contenido */}
                                    <div className="bg-white rounded-lg p-4 shadow-sm">
                                      {tabHistoricoActiva === 'info' && (
                                        <div className="grid grid-cols-2 gap-4 text-sm">
                                          <div>
                                            <label className="block text-xs font-semibold text-gray-600">Entidad</label>
                                            <div>{hist.ENTIDAD || '-'}</div>
                                          </div>
                                          <div>
                                            <label className="block text-xs font-semibold text-gray-600">Valor Ref.</label>
                                            <div>{hist.VALOR_REFERENCIAL ? `S/ ${Number(hist.VALOR_REFERENCIAL).toLocaleString()}` : '-'}</div>
                                          </div>
                                          <div>
                                            <label className="block text-xs font-semibold text-gray-600">Monto Adjudicado</label>
                                            <div className="text-green-600 font-semibold">
                                              {hist.MONTO_ADJUDICADO ? `S/ ${Number(hist.MONTO_ADJUDICADO).toLocaleString()}` : '-'}
                                            </div>
                                          </div>
                                          <div>
                                            <label className="block text-xs font-semibold text-gray-600">Ganador</label>
                                            <div>{hist.GANADOR_NOMBRE || '-'}</div>
                                            <div className="text-xs text-gray-500">RUC: {hist.GANADOR_RUC || '-'}</div>
                                          </div>
                                          <div>
                                            <label className="block text-xs font-semibold text-gray-600">Fecha Convocatoria</label>
                                            <div>{hist.FECHA_CONVOCATORIA || '-'}</div>
                                          </div>
                                          <div>
                                            <label className="block text-xs font-semibold text-gray-600">Fecha Buena Pro</label>
                                            <div>{hist.FECHA_BUENA_PRO || '-'}</div>
                                          </div>
                                          <div>
                                            <label className="block text-xs font-semibold text-gray-600">Total Postores</label>
                                            <div>{hist.TOTAL_POSTORES || '-'}</div>
                                          </div>
                                          <div>
                                            <label className="block text-xs font-semibold text-gray-600">Fuente</label>
                                            <span className={`px-2 py-1 rounded text-xs font-medium ${
                                              hist.FUENTE === 'IA' ? 'bg-blue-100 text-blue-700' :
                                              hist.FUENTE === 'JSON' ? 'bg-purple-100 text-purple-700' :
                                              hist.FUENTE === 'MANUAL' ? 'bg-green-100 text-green-700' :
                                              'bg-gray-100 text-gray-700'
                                            }`}>
                                              {hist.FUENTE || 'N/A'}
                                            </span>
                                          </div>
                                        </div>
                                      )}

                                      {tabHistoricoActiva === 'documentos' && (
                                        <div className="space-y-4">
                                          {/* Uploader de documentos para este histórico */}
                                          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                                            <h5 className="font-semibold text-blue-900 mb-2 flex items-center gap-2 text-sm">
                                              <Upload size={14} />
                                              Subir documentos a Drive
                                            </h5>
                                            <FileUploader
                                              nomenclatura={hist.NOMENCLATURA}
                                              etapa="BUENA_PRO"
                                              entidad={hist.ENTIDAD}
                                              documentosDisponibles={documentos}
                                              esHistorico={true}
                                              añoProceso={String(hist.AÑO)}
                                              onUploadComplete={(results: UploadResult[]) => {
                                                const exitosos = results.filter(r => r.success).length;
                                                if (exitosos > 0) {
                                                  alert(`${exitosos} documento(s) subido(s) para ${hist.NOMENCLATURA}`);
                                                  cargarDetalleCompleto();
                                                }
                                              }}
                                              maxFiles={5}
                                              compact
                                            />
                                          </div>

                                          {/* Lista de documentos existentes con opción de ver */}
                                          <div className="mt-4">
                                            <h5 className="font-medium text-gray-700 mb-3 text-sm flex items-center gap-2">
                                              <FileText size={14} />
                                              Documentos del Proceso ({documentos.length})
                                            </h5>
                                            {documentos.length === 0 ? (
                                              <div className="text-center py-6 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
                                                <FileText className="w-10 h-10 mx-auto text-gray-300 mb-2" />
                                                <p className="text-gray-500 text-sm">No hay documentos registrados</p>
                                                <p className="text-gray-400 text-xs mt-1">Sube documentos usando el uploader de arriba</p>
                                              </div>
                                            ) : (
                                              <div className="space-y-2">
                                                {documentos.map((doc: any, i: number) => {
                                                  const tieneUrl = doc.url || doc.URL || doc.link;
                                                  const urlDocumento = doc.url || doc.URL || doc.link;
                                                  const etapaDoc = doc.etapa || doc.ETAPA || '';
                                                  const tipoDoc = doc.tipo || doc.TIPO || 'PDF';

                                                  return (
                                                    <div
                                                      key={i}
                                                      className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg hover:shadow-sm transition"
                                                    >
                                                      <div className="flex items-center gap-3 flex-1 min-w-0">
                                                        <div className={`p-2 rounded ${
                                                          tipoDoc === 'PDF' ? 'bg-red-100' :
                                                          tipoDoc === 'DOC' || tipoDoc === 'DOCX' ? 'bg-blue-100' :
                                                          tipoDoc === 'XLS' || tipoDoc === 'XLSX' ? 'bg-green-100' :
                                                          tipoDoc === 'ZIP' ? 'bg-yellow-100' :
                                                          'bg-gray-100'
                                                        }`}>
                                                          <FileText size={16} className={
                                                            tipoDoc === 'PDF' ? 'text-red-500' :
                                                            tipoDoc === 'DOC' || tipoDoc === 'DOCX' ? 'text-blue-500' :
                                                            tipoDoc === 'XLS' || tipoDoc === 'XLSX' ? 'text-green-500' :
                                                            tipoDoc === 'ZIP' ? 'text-yellow-600' :
                                                            'text-gray-500'
                                                          } />
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                          <p className="text-sm font-medium text-gray-700 truncate">
                                                            {doc.nombre || doc.NOMBRE || 'Documento'}
                                                          </p>
                                                          <div className="flex items-center gap-2 text-xs text-gray-400">
                                                            {etapaDoc && <span className="bg-gray-100 px-1.5 py-0.5 rounded">{etapaDoc}</span>}
                                                            <span>{tipoDoc}</span>
                                                            {doc.tamanio && <span>{doc.tamanio}</span>}
                                                          </div>
                                                        </div>
                                                      </div>
                                                      <div className="flex items-center gap-1">
                                                        {tieneUrl ? (
                                                          <a
                                                            href={urlDocumento}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="p-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition"
                                                            title="Ver documento"
                                                            onClick={(e) => e.stopPropagation()}
                                                          >
                                                            <Eye size={16} />
                                                          </a>
                                                        ) : (
                                                          <span className="p-2 bg-gray-50 text-gray-300 rounded-lg" title="Sin enlace">
                                                            <Eye size={16} />
                                                          </span>
                                                        )}
                                                      </div>
                                                    </div>
                                                  );
                                                })}
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                      )}

                                      {tabHistoricoActiva === 'postores' && (
                                        <div className="space-y-2">
                                          {postores.length === 0 ? (
                                            <p className="text-gray-500 text-center py-4 text-sm">Sin postores</p>
                                          ) : (
                                            postores.map((p: any, i: number) => (
                                              <div key={i} className="p-2 bg-gray-50 rounded">
                                                <div className="font-medium text-sm">{p.nombre || p.razonSocial || 'Postor'}</div>
                                                <div className="text-xs text-gray-500">RUC: {p.ruc || '-'}</div>
                                              </div>
                                            ))
                                          )}
                                        </div>
                                      )}

                                      {tabHistoricoActiva === 'resumen' && (
                                        <div className="space-y-4">
                                          {generandoAnalisis ? (
                                            <div className="flex flex-col items-center justify-center py-12">
                                              <Loader className="w-12 h-12 animate-spin text-purple-500 mb-4" />
                                              <p className="text-gray-600 font-medium">Generando análisis comparativo...</p>
                                              <p className="text-sm text-gray-400 mt-2">La IA está analizando todos los históricos</p>
                                            </div>
                                          ) : analisisIA ? (
                                            <div className="space-y-4">
                                              <div className="flex items-center justify-between">
                                                <h4 className="font-bold text-purple-800 flex items-center gap-2">
                                                  <Award size={18} />
                                                  Análisis Comparativo Generado por IA
                                                </h4>
                                                <button
                                                  onClick={generarAnalisisComparativo}
                                                  className="flex items-center gap-1 px-3 py-1.5 bg-purple-100 text-purple-700 rounded text-sm hover:bg-purple-200 transition"
                                                >
                                                  <RefreshCw size={14} />
                                                  Regenerar
                                                </button>
                                              </div>
                                              <div
                                                className="prose prose-sm max-w-none bg-gray-50 p-4 rounded-lg border overflow-auto max-h-[600px]"
                                                dangerouslySetInnerHTML={{
                                                  __html: markdownToHtml(analisisIA)
                                                }}
                                              />
                                            </div>
                                          ) : (
                                            <div className="text-center py-12">
                                              <Award className="w-16 h-16 mx-auto text-gray-300 mb-4" />
                                              <p className="text-gray-500 mb-4">No hay análisis generado aún</p>
                                              <button
                                                onClick={generarAnalisisComparativo}
                                                className="px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition flex items-center gap-2 mx-auto"
                                              >
                                                <Award size={16} />
                                                Generar Análisis con IA
                                              </button>
                                            </div>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                });
              })()}
            </div>

            {/* Selector de modo: AI vs Manual vs JSON */}
            <div className="mt-4 flex gap-2 justify-center flex-wrap">
              <button
                onClick={() => setModoHistorico('ai')}
                className={`px-4 py-2 rounded text-sm font-medium transition ${
                  modoHistorico === 'ai'
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                ✨ Extracción con IA
              </button>
              <button
                onClick={() => setModoHistorico('json')}
                className={`px-4 py-2 rounded text-sm font-medium transition ${
                  modoHistorico === 'json'
                    ? 'bg-purple-500 text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                📋 Importar JSON
              </button>
              <button
                onClick={() => setModoHistorico('manual')}
                className={`px-4 py-2 rounded text-sm font-medium transition ${
                  modoHistorico === 'manual'
                    ? 'bg-green-500 text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                ✍️ Entrada Manual
              </button>
            </div>

            {/* Modo IA - Upload de imágenes */}
            {modoHistorico === 'ai' && (
              <div
                className="mt-4 p-4 border-2 border-dashed border-blue-300 rounded-lg text-center bg-blue-50"
                onDrop={handleDrop}
                onDragOver={handleDragOver}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleImageSelect}
                  className="hidden"
                />

                {selectedImages.length === 0 ? (
                  <>
                    <Upload className="mx-auto text-blue-400 mb-2" size={24} />
                    <p className="text-sm text-gray-700 font-medium">
                      Extracción Inteligente con IA
                    </p>
                    <p className="text-xs text-gray-500 mb-3">
                      Arrastra capturas del SEACE o haz clic para seleccionar (hasta 3 imágenes)
                    </p>
                    <button
                      className="px-4 py-2 bg-blue-500 text-white rounded text-sm hover:bg-blue-600"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadingIA}
                    >
                      📸 Seleccionar Imágenes
                    </button>
                  </>
                ) : (
                  <>
                    <div className="flex flex-wrap gap-2 justify-center mb-3">
                      {selectedImages.map((img, idx) => (
                        <div key={idx} className="relative">
                          <div className="w-20 h-20 border rounded overflow-hidden bg-gray-100 flex items-center justify-center">
                            <ImageIcon size={24} className="text-gray-400" />
                          </div>
                          <button
                            onClick={() => removeImage(idx)}
                            className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs hover:bg-red-600"
                          >
                            ×
                          </button>
                          <p className="text-xs text-gray-500 mt-1 truncate w-20">{img.name}</p>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-gray-600 mb-2">
                      {selectedImages.length} imagen{selectedImages.length > 1 ? 'es' : ''} seleccionada{selectedImages.length > 1 ? 's' : ''} (máximo 3)
                    </p>
                    <div className="flex gap-2 justify-center">
                      <button
                        onClick={handleExtractWithIA}
                        disabled={uploadingIA}
                        className="px-4 py-2 bg-blue-500 text-white rounded text-sm hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                      >
                        {uploadingIA ? (
                          <>
                            <Loader className="animate-spin" size={16} />
                            Extrayendo datos...
                          </>
                        ) : (
                          <>
                            ✨ Extraer con IA
                          </>
                        )}
                      </button>
                      <button
                        onClick={() => {
                          setSelectedImages([]);
                          if (fileInputRef.current) fileInputRef.current.value = '';
                        }}
                        disabled={uploadingIA}
                        className="px-4 py-2 bg-gray-200 text-gray-700 rounded text-sm hover:bg-gray-300 disabled:opacity-50"
                      >
                        Cancelar
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Modo JSON - Importar datos */}
            {modoHistorico === 'json' && (
              <div className="mt-4 p-4 border-2 border-purple-300 rounded-lg bg-purple-50">
                <h4 className="font-semibold text-purple-900 mb-3">Importar Datos desde JSON</h4>

                {/* Selector de nomenclatura */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Selecciona el proceso histórico:
                  </label>
                  <select
                    value={nomenclaturaSeleccionada}
                    onChange={(e) => setNomenclaturaSeleccionada(e.target.value)}
                    className="w-full px-3 py-2 border border-purple-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 bg-white"
                  >
                    <option value="">-- Seleccionar proceso --</option>
                    {getNomenclaturasDisponibles().map(({ nom, año, tieneDatos }) => (
                      <option key={nom} value={nom}>
                        {año} - {nom} {tieneDatos ? '✅' : '⏳'}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    ✅ = Tiene datos | ⏳ = Pendiente de datos
                  </p>
                </div>

                {/* Textarea para JSON */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Pega el JSON aquí:
                  </label>
                  <textarea
                    value={jsonInput}
                    onChange={(e) => setJsonInput(e.target.value)}
                    placeholder={`{
  "entidad": "EMPRESA...",
  "objeto": "SERVICIO DE...",
  "valorReferencial": 500000,
  "montoAdjudicado": 450000,
  "ganadorRuc": "20123456789",
  "ganadorNombre": "EMPRESA GANADORA SAC",
  "fechaConvocatoria": "2024-01-15",
  "fechaBuenaPro": "2024-03-20",
  "totalPostores": 5,
  "postores": [...],
  "documentos": [...]
}`}
                    rows={10}
                    className="w-full px-3 py-2 border border-purple-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-purple-500"
                  />
                </div>

                {/* Botones */}
                <div className="flex gap-2">
                  <button
                    onClick={handleImportJSON}
                    disabled={importandoJson || !nomenclaturaSeleccionada || !jsonInput.trim()}
                    className="flex-1 px-4 py-2 bg-purple-500 text-white rounded text-sm font-medium hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {importandoJson ? (
                      <>
                        <Loader className="animate-spin" size={16} />
                        Importando...
                      </>
                    ) : (
                      <>📥 Importar Datos</>
                    )}
                  </button>
                  <button
                    onClick={() => {
                      setJsonInput('');
                      setNomenclaturaSeleccionada('');
                    }}
                    disabled={importandoJson}
                    className="px-4 py-2 bg-gray-200 text-gray-700 rounded text-sm hover:bg-gray-300"
                  >
                    Limpiar
                  </button>
                </div>
              </div>
            )}

            {/* Modo Manual - Formulario */}
            {modoHistorico === 'manual' && (
              <div className="mt-4 p-4 border-2 border-green-300 rounded-lg bg-green-50">
                <h4 className="font-semibold text-green-900 mb-3">Agregar Histórico Manualmente</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Año *
                    </label>
                    <input
                      type="number"
                      value={historicopManual.año}
                      onChange={(e) => setHistoricoManual({ ...historicopManual, año: parseInt(e.target.value) })}
                      className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                      min="2020"
                      max="2030"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Entidad *
                    </label>
                    <input
                      type="text"
                      value={historicopManual.entidad}
                      onChange={(e) => setHistoricoManual({ ...historicopManual, entidad: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                      placeholder="Nombre de la entidad"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Objeto del Proceso
                    </label>
                    <textarea
                      value={historicopManual.objeto}
                      onChange={(e) => setHistoricoManual({ ...historicopManual, objeto: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                      rows={2}
                      placeholder="Descripción del objeto del proceso"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Valor Referencial (S/)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={historicopManual.valorReferencial}
                      onChange={(e) => setHistoricoManual({ ...historicopManual, valorReferencial: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                      placeholder="0.00"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Monto Adjudicado (S/)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={historicopManual.montoAdjudicado}
                      onChange={(e) => setHistoricoManual({ ...historicopManual, montoAdjudicado: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                      placeholder="0.00"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      RUC Ganador
                    </label>
                    <input
                      type="text"
                      value={historicopManual.ganadorRuc}
                      onChange={(e) => setHistoricoManual({ ...historicopManual, ganadorRuc: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                      placeholder="20123456789"
                      maxLength={11}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Nombre Ganador
                    </label>
                    <input
                      type="text"
                      value={historicopManual.ganadorNombre}
                      onChange={(e) => setHistoricoManual({ ...historicopManual, ganadorNombre: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                      placeholder="Empresa SAC"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Fecha Convocatoria
                    </label>
                    <input
                      type="date"
                      value={historicopManual.fechaConvocatoria}
                      onChange={(e) => setHistoricoManual({ ...historicopManual, fechaConvocatoria: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Fecha Buena Pro
                    </label>
                    <input
                      type="date"
                      value={historicopManual.fechaBuenaPro}
                      onChange={(e) => setHistoricoManual({ ...historicopManual, fechaBuenaPro: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Número de Contrato
                    </label>
                    <input
                      type="text"
                      value={historicopManual.numeroContrato}
                      onChange={(e) => setHistoricoManual({ ...historicopManual, numeroContrato: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                      placeholder="CONT-2024-001"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Total Postores
                    </label>
                    <input
                      type="number"
                      value={historicopManual.totalPostores}
                      onChange={(e) => setHistoricoManual({ ...historicopManual, totalPostores: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                      placeholder="0"
                      min="0"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Link OSCE
                    </label>
                    <input
                      type="url"
                      value={historicopManual.linkOsce}
                      onChange={(e) => setHistoricoManual({ ...historicopManual, linkOsce: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                      placeholder="https://..."
                    />
                  </div>
                </div>
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={guardarHistoricoManual}
                    disabled={guardando}
                    className="flex items-center gap-1 px-4 py-2 bg-green-500 text-white rounded text-sm hover:bg-green-600 disabled:opacity-50"
                  >
                    {guardando ? (
                      <>
                        <Loader className="animate-spin" size={14} />
                        Guardando...
                      </>
                    ) : (
                      <>
                        <Save size={14} />
                        Guardar Histórico
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => setModoHistorico('ai')}
                    disabled={guardando}
                    className="flex items-center gap-1 px-4 py-2 bg-gray-300 text-gray-700 rounded text-sm hover:bg-gray-400 disabled:opacity-50"
                  >
                    <X size={14} />
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default SeguimientoDetalleCompleto;
