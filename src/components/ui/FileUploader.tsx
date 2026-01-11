import { useState, useRef, useCallback } from 'react';
import { clsx } from 'clsx';
import { Upload, X, Check, AlertCircle, FileText, Eye, Loader2, Link2 } from 'lucide-react';
import { uploadDocument, validarArchivo, EXTENSIONES_PERMITIDAS, TAMAÑO_MAXIMO_MB } from '../../services/api';
import type { Documento, DocumentoSeace, EtapaSeace, UploadResult } from '../../types';

interface FileUploadItem {
  id: string;
  file: File;
  status: 'pending' | 'uploading' | 'success' | 'error';
  progress: number;
  result?: UploadResult;
  error?: string;
  documentoDestino?: string; // Nombre del documento existente a vincular
}

interface FileUploaderProps {
  nomenclatura: string;
  etapa?: EtapaSeace;
  entidad?: string;
  /** Lista de documentos existentes para vincular (soporta ambos formatos) */
  documentosDisponibles?: (DocumentoSeace | Documento)[];
  onUploadComplete?: (results: UploadResult[]) => void;
  maxFiles?: number;
  className?: string;
  compact?: boolean;
  /** Si es proceso histórico, sube a HISTORICOS/{año}/ */
  esHistorico?: boolean;
  /** Año del proceso para históricos */
  añoProceso?: string;
}

export function FileUploader({
  nomenclatura,
  etapa,
  entidad,
  documentosDisponibles = [],
  onUploadComplete,
  maxFiles = 5,
  className,
  compact = false,
  esHistorico = false,
  añoProceso,
}: FileUploaderProps) {
  const [files, setFiles] = useState<FileUploadItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Filtrar documentos sin URL (los que aún no tienen archivo vinculado)
  // Soportar múltiples nombres de campo: url, URL_DRIVE, URL_ARCHIVO
  const documentosSinArchivo = documentosDisponibles.filter((doc: any) => {
    const tieneUrl = doc.url || doc.URL_DRIVE || doc.URL_ARCHIVO;
    return !tieneUrl;
  });

  const addFiles = useCallback((newFiles: FileList | File[]) => {
    const fileArray = Array.from(newFiles);
    const validFiles: FileUploadItem[] = [];

    for (const file of fileArray) {
      if (files.length + validFiles.length >= maxFiles) {
        break;
      }

      const validation = validarArchivo(file);
      if (validation.valido) {
        validFiles.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
          file,
          status: 'pending',
          progress: 0,
          documentoDestino: undefined,
        });
      } else {
        validFiles.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
          file,
          status: 'error',
          progress: 0,
          error: validation.error,
        });
      }
    }

    setFiles((prev) => [...prev, ...validFiles]);
  }, [files.length, maxFiles]);

  // Actualizar el documento destino de un archivo
  const setDocumentoDestino = useCallback((fileId: string, docNombre: string | undefined) => {
    setFiles((prev) =>
      prev.map((f) =>
        f.id === fileId ? { ...f, documentoDestino: docNombre } : f
      )
    );
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    addFiles(e.dataTransfer.files);
  }, [addFiles]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      addFiles(e.target.files);
    }
    // Reset input para permitir seleccionar el mismo archivo otra vez
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  }, [addFiles]);

  const removeFile = useCallback((id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const uploadFiles = useCallback(async () => {
    const pendingFiles = files.filter((f) => f.status === 'pending');
    if (pendingFiles.length === 0) return;

    setIsUploading(true);
    const results: UploadResult[] = [];

    for (const fileItem of pendingFiles) {
      // Actualizar estado a uploading
      setFiles((prev) =>
        prev.map((f) =>
          f.id === fileItem.id ? { ...f, status: 'uploading' as const, progress: 50 } : f
        )
      );

      try {
        // Pasar documentoDestino y params de histórico si aplica
        const result = await uploadDocument(
          nomenclatura,
          fileItem.file,
          etapa,
          entidad,
          fileItem.documentoDestino,
          esHistorico,
          añoProceso
        );
        results.push(result);

        // Actualizar estado final
        setFiles((prev) =>
          prev.map((f) =>
            f.id === fileItem.id
              ? {
                  ...f,
                  status: result.success ? ('success' as const) : ('error' as const),
                  progress: 100,
                  result,
                  error: result.error,
                }
              : f
          )
        );
      } catch (error) {
        const errorResult: UploadResult = {
          success: false,
          error: error instanceof Error ? error.message : 'Error desconocido',
        };
        results.push(errorResult);

        setFiles((prev) =>
          prev.map((f) =>
            f.id === fileItem.id
              ? { ...f, status: 'error' as const, progress: 100, error: errorResult.error }
              : f
          )
        );
      }
    }

    setIsUploading(false);
    if (onUploadComplete) {
      onUploadComplete(results);
    }
  }, [files, nomenclatura, etapa, entidad, onUploadComplete, esHistorico, añoProceso]);

  const clearCompleted = useCallback(() => {
    setFiles((prev) => prev.filter((f) => f.status === 'pending' || f.status === 'uploading'));
  }, []);

  const getFileIcon = (status: FileUploadItem['status']) => {
    switch (status) {
      case 'uploading':
        return <Loader2 className="w-4 h-4 animate-spin text-blue-500" />;
      case 'success':
        return <Check className="w-4 h-4 text-green-500" />;
      case 'error':
        return <AlertCircle className="w-4 h-4 text-red-500" />;
      default:
        return <FileText className="w-4 h-4 text-gray-400" />;
    }
  };

  const hasCompleted = files.some((f) => f.status === 'success' || f.status === 'error');
  const hasPending = files.some((f) => f.status === 'pending');

  return (
    <div className={clsx('space-y-3', className)}>
      {/* Zona de drop */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={clsx(
          'border-2 border-dashed rounded-lg cursor-pointer transition-all duration-200',
          compact ? 'p-3' : 'p-6',
          isDragging
            ? 'border-blue-500 bg-blue-50'
            : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50',
          files.length >= maxFiles && 'opacity-50 cursor-not-allowed'
        )}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={EXTENSIONES_PERMITIDAS.join(',')}
          onChange={handleFileSelect}
          className="hidden"
          disabled={files.length >= maxFiles}
        />
        <div className="flex flex-col items-center gap-2 text-center">
          <Upload className={clsx('text-gray-400', compact ? 'w-6 h-6' : 'w-10 h-10')} />
          {!compact && (
            <>
              <p className="text-sm text-gray-600">
                <span className="font-medium text-blue-600">Haz clic</span> o arrastra archivos
              </p>
              <p className="text-xs text-gray-400">
                PDF, DOC, XLS, JPG, PNG, ZIP - Max {TAMAÑO_MAXIMO_MB}MB
              </p>
            </>
          )}
          {compact && (
            <p className="text-xs text-gray-500">Subir archivo</p>
          )}
        </div>
      </div>

      {/* Lista de archivos */}
      {files.length > 0 && (
        <div className="space-y-2">
          {files.map((fileItem) => (
            <div
              key={fileItem.id}
              className={clsx(
                'p-2 rounded-lg border',
                fileItem.status === 'error'
                  ? 'bg-red-50 border-red-200'
                  : fileItem.status === 'success'
                  ? 'bg-green-50 border-green-200'
                  : 'bg-gray-50 border-gray-200'
              )}
            >
              <div className="flex items-center gap-3">
                {getFileIcon(fileItem.status)}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-700 truncate">
                    {fileItem.file.name}
                  </p>
                  <p className="text-xs text-gray-400">
                    {(fileItem.file.size / 1024).toFixed(1)} KB
                    {fileItem.error && (
                      <span className="text-red-500 ml-2">{fileItem.error}</span>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {fileItem.status === 'success' && fileItem.result?.viewUrl && (
                    <a
                      href={fileItem.result.viewUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1 hover:bg-green-100 rounded"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Eye className="w-4 h-4 text-green-600" />
                    </a>
                  )}
                  {(fileItem.status === 'pending' || fileItem.status === 'error') && (
                    <button
                      onClick={() => removeFile(fileItem.id)}
                      className="p-1 hover:bg-gray-200 rounded"
                    >
                      <X className="w-4 h-4 text-gray-500" />
                    </button>
                  )}
                </div>
              </div>

              {/* Selector de documento destino - solo para archivos pendientes */}
              {fileItem.status === 'pending' && documentosSinArchivo.length > 0 && (
                <div className="mt-2 flex items-center gap-2">
                  <Link2 className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  <select
                    value={fileItem.documentoDestino || ''}
                    onChange={(e) => setDocumentoDestino(fileItem.id, e.target.value || undefined)}
                    className="flex-1 text-xs border border-gray-300 rounded px-2 py-1 bg-white focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">-- Crear nuevo documento --</option>
                    {documentosSinArchivo.map((doc: any, idx) => {
                      // Soportar ambos formatos de campo (NOMBRE/nombre, TIPO/tipo)
                      const nombreDoc = doc.NOMBRE || doc.nombre || doc.NOMBRE_ARCHIVO || 'Documento';
                      const tipoDoc = doc.TIPO || doc.tipo || doc.TIPO_DOCUMENTO || '';
                      return (
                        <option key={idx} value={nombreDoc}>
                          {nombreDoc} {tipoDoc ? `(${tipoDoc})` : ''}
                        </option>
                      );
                    })}
                  </select>
                </div>
              )}

              {/* Mostrar documento vinculado si se seleccionó */}
              {fileItem.status === 'pending' && fileItem.documentoDestino && (
                <p className="mt-1 text-xs text-blue-600 flex items-center gap-1">
                  <Link2 className="w-3 h-3" />
                  Vinculando con: {fileItem.documentoDestino}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Botones de acción */}
      {files.length > 0 && (
        <div className="flex gap-2">
          {hasPending && (
            <button
              onClick={uploadFiles}
              disabled={isUploading}
              className={clsx(
                'flex-1 px-4 py-2 text-sm font-medium rounded-lg transition-all',
                isUploading
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              )}
            >
              {isUploading ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Subiendo...
                </span>
              ) : (
                `Subir ${files.filter((f) => f.status === 'pending').length} archivo(s)`
              )}
            </button>
          )}
          {hasCompleted && (
            <button
              onClick={clearCompleted}
              className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200"
            >
              Limpiar
            </button>
          )}
        </div>
      )}
    </div>
  );
}
