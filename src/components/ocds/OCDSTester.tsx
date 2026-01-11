import { useState } from 'react';
import { Search, Database, FileText } from 'lucide-react';
import { getProcesoOCDS, getByTenderId, getByOcid, type DatosProcesoOCDS } from '../../services/api';

export function OCDSTester() {
  const [tipoConsulta, setTipoConsulta] = useState<'nomenclatura' | 'tenderId' | 'ocid'>('nomenclatura');
  const [valor, setValor] = useState('');
  const [loading, setLoading] = useState(false);
  const [resultado, setResultado] = useState<DatosProcesoOCDS | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Ejemplos precargados
  const ejemplos = {
    nomenclatura: 'CP-SM-52-2024-ELSE-1',
    tenderId: '1089084',
    ocid: 'ocds-dgy273-seacev3-1089084'
  };

  const handleConsultar = async () => {
    if (!valor.trim()) {
      setError('Ingresa un valor para consultar');
      return;
    }

    setLoading(true);
    setError(null);
    setResultado(null);

    try {
      let datos: DatosProcesoOCDS | null = null;

      if (tipoConsulta === 'nomenclatura') {
        datos = await getProcesoOCDS(valor);
      } else if (tipoConsulta === 'tenderId') {
        datos = await getByTenderId(valor);
      } else if (tipoConsulta === 'ocid') {
        datos = await getByOcid(valor);
      }

      if (datos) {
        setResultado(datos);
      } else {
        setError('No se encontró el proceso');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al consultar');
    } finally {
      setLoading(false);
    }
  };

  const cargarEjemplo = () => {
    setValor(ejemplos[tipoConsulta]);
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">🔍 Prueba OCDS API</h1>
        <p className="text-gray-600 mt-2">
          Consulta datos de procesos desde la API OCDS del gobierno
        </p>
      </div>

      {/* Selector de tipo de consulta */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold mb-4">Tipo de Consulta</h2>
        <div className="grid grid-cols-3 gap-4">
          <button
            onClick={() => setTipoConsulta('nomenclatura')}
            className={`p-4 rounded-lg border-2 transition-all ${
              tipoConsulta === 'nomenclatura'
                ? 'border-blue-500 bg-blue-50'
                : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <FileText className={`w-6 h-6 mx-auto mb-2 ${
              tipoConsulta === 'nomenclatura' ? 'text-blue-500' : 'text-gray-400'
            }`} />
            <div className="text-sm font-medium">Nomenclatura</div>
            <div className="text-xs text-gray-500 mt-1">CP-SM-52-2024-ELSE-1</div>
          </button>

          <button
            onClick={() => setTipoConsulta('tenderId')}
            className={`p-4 rounded-lg border-2 transition-all ${
              tipoConsulta === 'tenderId'
                ? 'border-blue-500 bg-blue-50'
                : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <Database className={`w-6 h-6 mx-auto mb-2 ${
              tipoConsulta === 'tenderId' ? 'text-blue-500' : 'text-gray-400'
            }`} />
            <div className="text-sm font-medium">Tender ID</div>
            <div className="text-xs text-gray-500 mt-1">1089084</div>
          </button>

          <button
            onClick={() => setTipoConsulta('ocid')}
            className={`p-4 rounded-lg border-2 transition-all ${
              tipoConsulta === 'ocid'
                ? 'border-blue-500 bg-blue-50'
                : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <Search className={`w-6 h-6 mx-auto mb-2 ${
              tipoConsulta === 'ocid' ? 'text-blue-500' : 'text-gray-400'
            }`} />
            <div className="text-sm font-medium">OCID</div>
            <div className="text-xs text-gray-500 mt-1">ocds-dgy273...</div>
          </button>
        </div>
      </div>

      {/* Input y búsqueda */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold mb-4">Consultar</h2>
        <div className="flex gap-3">
          <input
            type="text"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            placeholder={`Ingresa ${tipoConsulta}...`}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            onKeyPress={(e) => e.key === 'Enter' && handleConsultar()}
          />
          <button
            onClick={cargarEjemplo}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Cargar Ejemplo
          </button>
          <button
            onClick={handleConsultar}
            disabled={loading}
            className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-400 flex items-center gap-2"
          >
            <Search className="w-4 h-4" />
            {loading ? 'Consultando...' : 'Consultar'}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          {error}
        </div>
      )}

      {/* Resultado */}
      {resultado && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold mb-4">Resultado</h2>

          {/* Info básica */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div>
              <div className="text-sm text-gray-600">Nomenclatura</div>
              <div className="font-medium text-sm">{resultado.nomenclatura || 'N/A'}</div>
            </div>
            <div>
              <div className="text-sm text-gray-600">Tender ID</div>
              <div className="font-medium text-sm">{resultado.tenderId || 'N/A'}</div>
            </div>
            <div>
              <div className="text-sm text-gray-600">OCID</div>
              <div className="font-mono text-xs">{resultado.ocid || 'N/A'}</div>
            </div>
            <div>
              <div className="text-sm text-gray-600">Modalidad</div>
              <div className="font-medium text-sm">{resultado.tipoProcedimiento || 'N/A'}</div>
            </div>
            <div>
              <div className="text-sm text-gray-600">Objeto</div>
              <div className="font-medium text-sm">{resultado.categoria || 'N/A'}</div>
            </div>
            <div>
              <div className="text-sm text-gray-600">Método</div>
              <div className="font-medium text-sm">{resultado.metodo || 'N/A'}</div>
            </div>
          </div>

          {/* Descripción */}
          {resultado.descripcion && (
            <div className="mb-6 p-4 bg-gray-50 rounded-lg">
              <div className="text-sm font-medium text-gray-900 mb-2">Descripción del Proceso</div>
              <div className="text-sm text-gray-700">{resultado.descripcion}</div>
            </div>
          )}

          {/* Entidad Convocante COMPLETA */}
          {resultado.entidad && (
            <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
              <div className="text-sm font-semibold text-blue-900 mb-3">🏛️ Entidad Convocante</div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-xs text-blue-600">Nombre</div>
                  <div className="text-sm font-medium text-blue-900">{resultado.entidad.nombre}</div>
                </div>
                {resultado.entidad.ruc && (
                  <div>
                    <div className="text-xs text-blue-600">RUC</div>
                    <div className="text-sm font-medium text-blue-900">{resultado.entidad.ruc}</div>
                  </div>
                )}
                {resultado.entidad.direccion && (
                  <div>
                    <div className="text-xs text-blue-600">Dirección</div>
                    <div className="text-sm text-blue-800">{resultado.entidad.direccion}</div>
                  </div>
                )}
                {resultado.entidad.departamento && (
                  <div>
                    <div className="text-xs text-blue-600">Región</div>
                    <div className="text-sm text-blue-800">{resultado.entidad.departamento}</div>
                  </div>
                )}
                {resultado.entidad.telefono && (
                  <div>
                    <div className="text-xs text-blue-600">Teléfono</div>
                    <div className="text-sm text-blue-800">{resultado.entidad.telefono}</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Valor Referencial */}
          {resultado.valorReferencial && (
            <div className="mb-6 p-4 bg-green-50 rounded-lg border border-green-200">
              <div className="text-sm text-gray-600 mb-1">💰 Valor Referencial</div>
              <div className="text-3xl font-bold text-green-700">
                {resultado.moneda} {resultado.valorReferencial.toLocaleString('es-PE', { minimumFractionDigits: 2 })}
              </div>
              {resultado.montoAdjudicado && (
                <div className="mt-2 text-sm text-green-700">
                  Monto Adjudicado: {resultado.moneda} {resultado.montoAdjudicado.toLocaleString('es-PE', { minimumFractionDigits: 2 })}
                </div>
              )}
            </div>
          )}

          {/* Postores */}
          {resultado.postores && resultado.postores.length > 0 && (
            <div className="mb-6">
              <div className="text-sm font-medium text-gray-900 mb-3">
                Postores ({resultado.postores.length})
              </div>
              <div className="space-y-2">
                {resultado.postores.map((postor, idx) => (
                  <div key={idx} className="p-3 bg-gray-50 rounded border border-gray-200">
                    <div className="text-sm font-medium">{postor.nombre}</div>
                    <div className="text-xs text-gray-600 mt-1">RUC: {postor.ruc}</div>
                    {postor.esGanador && (
                      <span className="inline-block mt-1 px-2 py-0.5 bg-green-100 text-green-800 text-xs rounded">
                        Ganador
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Documentos COMPLETOS */}
          {resultado.documentos && resultado.documentos.length > 0 && (
            <div className="mb-6">
              <div className="text-sm font-semibold text-gray-900 mb-3">
                📄 Documentos ({resultado.numDocumentos || resultado.documentos.length})
              </div>
              <div className="space-y-2">
                {resultado.documentos.map((doc, idx) => (
                  <div key={idx} className="p-3 bg-purple-50 rounded-lg border border-purple-200 hover:border-purple-400 transition-colors">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="text-sm font-medium text-purple-900">{doc.titulo}</div>
                        <div className="text-xs text-purple-600 mt-1">
                          <span className="px-2 py-0.5 bg-purple-100 rounded">{doc.tipo || 'document'}</span>
                          {doc.formato && (
                            <span className="ml-2 px-2 py-0.5 bg-purple-100 rounded">{doc.formato.toUpperCase()}</span>
                          )}
                          {doc.fecha && (
                            <span className="ml-2 text-purple-500">• {new Date(doc.fecha).toLocaleDateString('es-PE')}</span>
                          )}
                        </div>
                      </div>
                      {doc.url && (
                        <a
                          href={doc.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ml-3 px-3 py-1 bg-purple-600 text-white text-xs rounded hover:bg-purple-700 transition-colors"
                        >
                          📥 Descargar
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Cronograma */}
          {resultado.cronograma && (
            <div className="mb-6">
              <div className="text-sm font-semibold text-gray-900 mb-3">
                📅 Cronograma del Proceso
              </div>
              <div className="space-y-2">
                {resultado.cronograma.convocatoriaInicio && (
                  <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                    <div className="text-sm font-medium text-blue-900">Convocatoria</div>
                    <div className="text-xs text-blue-700 mt-1">
                      {new Date(resultado.cronograma.convocatoriaInicio).toLocaleDateString('es-PE')}
                      {resultado.cronograma.convocatoriaFin && ` - ${new Date(resultado.cronograma.convocatoriaFin).toLocaleDateString('es-PE')}`}
                    </div>
                  </div>
                )}
                {resultado.cronograma.consultasInicio && (
                  <div className="p-3 bg-orange-50 rounded-lg border border-orange-200">
                    <div className="text-sm font-medium text-orange-900">Consultas y Observaciones</div>
                    <div className="text-xs text-orange-700 mt-1">
                      {new Date(resultado.cronograma.consultasInicio).toLocaleDateString('es-PE')}
                      {resultado.cronograma.consultasFin && ` - ${new Date(resultado.cronograma.consultasFin).toLocaleDateString('es-PE')}`}
                    </div>
                  </div>
                )}
                {resultado.cronograma.buenaPro && (
                  <div className="p-3 bg-green-50 rounded-lg border border-green-200">
                    <div className="text-sm font-medium text-green-900">Buena Pro</div>
                    <div className="text-xs text-green-700 mt-1">
                      {new Date(resultado.cronograma.buenaPro).toLocaleDateString('es-PE')}
                    </div>
                  </div>
                )}
                {resultado.contrato?.inicio && (
                  <div className="p-3 bg-purple-50 rounded-lg border border-purple-200">
                    <div className="text-sm font-medium text-purple-900">
                      Ejecución del Contrato
                      {resultado.contrato.duracionDias && ` (${resultado.contrato.duracionDias} días)`}
                    </div>
                    <div className="text-xs text-purple-700 mt-1">
                      {new Date(resultado.contrato.inicio).toLocaleDateString('es-PE')}
                      {resultado.contrato.fin && ` - ${new Date(resultado.contrato.fin).toLocaleDateString('es-PE')}`}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Items */}
          {resultado.items && resultado.items.length > 0 && (
            <div className="mb-6">
              <div className="text-sm font-semibold text-gray-900 mb-3">
                📦 Items del Proceso ({resultado.numItems || resultado.items.length})
              </div>
              <div className="space-y-2">
                {resultado.items.map((item, idx) => (
                  <div key={idx} className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="text-sm font-medium text-gray-900">
                          {item.numero}. {item.descripcion}
                        </div>
                        <div className="text-xs text-gray-600 mt-1">
                          Cantidad: {item.cantidad} {item.unidad}
                          {item.clasificacion && (
                            <span className="ml-2 px-2 py-0.5 bg-gray-200 rounded">
                              {item.clasificacion}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Ganador y Contrato */}
          {(resultado.ganador || resultado.contrato) && (
            <div className="mb-6 p-4 bg-yellow-50 rounded-lg border-2 border-yellow-400">
              <div className="text-sm font-semibold text-yellow-900 mb-3">🏆 Adjudicación</div>
              {resultado.ganador && (
                <div className="mb-3">
                  <div className="text-xs text-yellow-600">Ganador</div>
                  <div className="text-sm font-bold text-yellow-900">{resultado.ganador.nombre}</div>
                  {resultado.ganador.ruc && (
                    <div className="text-xs text-yellow-700">RUC: {resultado.ganador.ruc}</div>
                  )}
                </div>
              )}
              {resultado.contrato && (
                <div className="grid grid-cols-2 gap-3 mt-3 pt-3 border-t border-yellow-300">
                  {resultado.contrato.numero && (
                    <div>
                      <div className="text-xs text-yellow-600">N° Contrato</div>
                      <div className="text-sm font-medium text-yellow-900">{resultado.contrato.numero}</div>
                    </div>
                  )}
                  {resultado.contrato.monto && (
                    <div>
                      <div className="text-xs text-yellow-600">Monto</div>
                      <div className="text-sm font-medium text-yellow-900">
                        {resultado.contrato.moneda} {resultado.contrato.monto.toLocaleString('es-PE', { minimumFractionDigits: 2 })}
                      </div>
                    </div>
                  )}
                  {resultado.contrato.fechaFirma && (
                    <div>
                      <div className="text-xs text-yellow-600">Fecha de Firma</div>
                      <div className="text-sm text-yellow-900">
                        {new Date(resultado.contrato.fechaFirma).toLocaleDateString('es-PE')}
                      </div>
                    </div>
                  )}
                  {resultado.contrato.duracionDias && (
                    <div>
                      <div className="text-xs text-yellow-600">Duración</div>
                      <div className="text-sm text-yellow-900">{resultado.contrato.duracionDias} días</div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* JSON completo */}
          <details className="mt-6">
            <summary className="cursor-pointer text-sm font-medium text-gray-700 hover:text-gray-900">
              Ver JSON completo
            </summary>
            <pre className="mt-3 p-4 bg-gray-900 text-gray-100 rounded-lg overflow-x-auto text-xs">
              {JSON.stringify(resultado, null, 2)}
            </pre>
          </details>
        </div>
      )}
    </div>
  );
}
