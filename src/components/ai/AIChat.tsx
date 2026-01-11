import { useState, useRef, useEffect } from 'react';
import { useStore } from '../../store/useStore';
import { geminiService } from '../../services/gemini';


import type { MensajeChat } from '../../types';
import {
  
  Send,
  X,
  Minimize2,
  Maximize2,
  Trash2,
  Sparkles,
  Copy,
  Check
} from 'lucide-react';
import { clsx } from 'clsx';

export function AIChat() {
  const {
    chatAbierto,
    setChatAbierto,
    mensajesChat,
    agregarMensajeChat,
    limpiarChat,
    procesosSeleccionados,
    procesos
  } = useStore();

  const [mensaje, setMensaje] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [minimizado, setMinimizado] = useState(false);
  const [copiado, setCopiado] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [mensajesChat]);

  const procesosContexto = (procesos || []).filter(p =>
    procesosSeleccionados.includes(p.ID)
  );

  const enviarMensaje = async () => {
    if (!mensaje.trim() || enviando) return;

    const nuevoMensaje: MensajeChat = {
      id: Date.now().toString(),
      rol: 'user',
      contenido: mensaje,
      timestamp: new Date(),
      procesosRelacionados: procesosSeleccionados
    };

    agregarMensajeChat(nuevoMensaje);
    setMensaje('');
    setEnviando(true);

    try {
      const respuesta = await geminiService.chatContextual(mensaje, procesosContexto);

      const respuestaIA: MensajeChat = {
        id: (Date.now() + 1).toString(),
        rol: 'assistant',
        contenido: respuesta,
        timestamp: new Date()
      };

      agregarMensajeChat(respuestaIA);
    } catch (error) {
      const errorMsg: MensajeChat = {
        id: (Date.now() + 1).toString(),
        rol: 'assistant',
        contenido: 'Lo siento, hubo un error al procesar tu mensaje. Por favor intenta de nuevo.',
        timestamp: new Date()
      };
      agregarMensajeChat(errorMsg);
    } finally {
      setEnviando(false);
    }
  };

  const copiarMensaje = (contenido: string, id: string) => {
    navigator.clipboard.writeText(contenido);
    setCopiado(id);
    setTimeout(() => setCopiado(null), 2000);
  };

  // Comandos rápidos
  const comandosRapidos = [
    { label: 'Analizar selección', comando: '/analizar' },
    { label: 'Comparar', comando: '/comparar' },
    { label: 'Resumen', comando: '/resumen' },
  ];

  const ejecutarComando = async (comando: string) => {
    if (procesosContexto.length === 0) {
      agregarMensajeChat({
        id: Date.now().toString(),
        rol: 'assistant',
        contenido: 'Por favor selecciona algunos procesos primero para poder analizarlos.',
        timestamp: new Date()
      });
      return;
    }

    setEnviando(true);

    try {
      let respuesta: string;

      switch (comando) {
        case '/analizar':
          if (procesosContexto.length === 1) {
            const analisis = await geminiService.analizarProceso(procesosContexto[0]);
            respuesta = `## Análisis de ${procesosContexto[0].NOMENCLATURA}\n\n` +
              `**Resumen:** ${analisis.resumen}\n\n` +
              `**Complejidad:** ${analisis.complejidad}\n\n` +
              `**Requisitos estimados:**\n${analisis.requisitosEstimados.map(r => `- ${r}`).join('\n')}\n\n` +
              `**Recomendaciones:**\n${analisis.recomendaciones.map(r => `- ${r}`).join('\n')}\n\n` +
              `**Palabras clave:** ${analisis.palabrasClave.join(', ')}`;
          } else {
            respuesta = await geminiService.chatContextual(
              'Analiza estos procesos y dame un resumen de cada uno.',
              procesosContexto
            );
          }
          break;

        case '/comparar':
          if (procesosContexto.length < 2) {
            respuesta = 'Necesitas seleccionar al menos 2 procesos para comparar.';
          } else {
            const comparacion = await geminiService.compararProcesos(procesosContexto);
            respuesta = `## Comparación de Procesos\n\n` +
              `**Similitudes:**\n${comparacion.similitudes.map(s => `- ${s}`).join('\n')}\n\n` +
              `**Diferencias:**\n${comparacion.diferencias.map(d => `- ${d}`).join('\n')}\n\n` +
              `**Mejor opción:** ${comparacion.mejorOpcion}\n\n` +
              `**Ranking:** ${comparacion.ranking.join(' > ')}`;
          }
          break;

        case '/resumen':
          const resumen = await geminiService.generarResumenEjecutivo(procesosContexto);
          respuesta = `## Resumen Ejecutivo\n\n` +
            `${resumen.resumen}\n\n` +
            `**Oportunidades destacadas:**\n${resumen.oportunidadesDestacadas.map(o => `- ${o}`).join('\n')}\n\n` +
            (resumen.alertas.length > 0 ? `**Alertas:**\n${resumen.alertas.map(a => `- ⚠️ ${a}`).join('\n')}\n\n` : '') +
            `**Tendencias:**\n${resumen.tendencias.map(t => `- ${t}`).join('\n')}`;
          break;

        default:
          respuesta = 'Comando no reconocido.';
      }

      agregarMensajeChat({
        id: Date.now().toString(),
        rol: 'user',
        contenido: comando,
        timestamp: new Date(),
        procesosRelacionados: procesosSeleccionados
      });

      agregarMensajeChat({
        id: (Date.now() + 1).toString(),
        rol: 'assistant',
        contenido: respuesta,
        timestamp: new Date()
      });

    } catch (error) {
      agregarMensajeChat({
        id: Date.now().toString(),
        rol: 'assistant',
        contenido: 'Error al ejecutar el comando. Por favor intenta de nuevo.',
        timestamp: new Date()
      });
    } finally {
      setEnviando(false);
    }
  };

  if (!chatAbierto) return null;

  return (
    <div
      className={clsx(
        'fixed bottom-4 right-4 bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col transition-all duration-300 z-50',
        minimizado ? 'w-72 h-14' : 'w-96 h-[600px]'
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gradient-to-r from-purple-600 to-blue-600 rounded-t-2xl">
        <div className="flex items-center gap-2 text-white">
          <Sparkles size={20} />
          <span className="font-semibold">Asistente IA</span>
          {procesosSeleccionados.length > 0 && (
            <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full">
              {procesosSeleccionados.length} seleccionados
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setMinimizado(!minimizado)}
            className="p-1.5 text-white/80 hover:text-white hover:bg-white/10 rounded-lg"
          >
            {minimizado ? <Maximize2 size={16} /> : <Minimize2 size={16} />}
          </button>
          <button
            onClick={() => setChatAbierto(false)}
            className="p-1.5 text-white/80 hover:text-white hover:bg-white/10 rounded-lg"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {!minimizado && (
        <>
          {/* Comandos rápidos */}
          <div className="px-3 py-2 border-b border-gray-100 flex gap-2 overflow-x-auto">
            {comandosRapidos.map(cmd => (
              <button
                key={cmd.comando}
                onClick={() => ejecutarComando(cmd.comando)}
                disabled={enviando}
                className="px-3 py-1 text-xs bg-purple-50 text-purple-700 rounded-full hover:bg-purple-100 whitespace-nowrap disabled:opacity-50"
              >
                {cmd.label}
              </button>
            ))}
            {mensajesChat.length > 0 && (
              <button
                onClick={limpiarChat}
                className="px-3 py-1 text-xs bg-gray-50 text-gray-600 rounded-full hover:bg-gray-100 whitespace-nowrap ml-auto"
              >
                <Trash2 size={12} className="inline mr-1" />
                Limpiar
              </button>
            )}
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {mensajesChat.length === 0 && (
              <div className="text-center text-gray-500 mt-8">
                <Sparkles size={40} className="mx-auto mb-3 text-purple-300" />
                <p className="font-medium">¡Hola! Soy tu asistente de SEACE</p>
                <p className="text-sm mt-1">
                  Selecciona procesos y hazme preguntas sobre ellos.
                </p>
              </div>
            )}

            {mensajesChat.map((msg) => (
              <div
                key={msg.id}
                className={clsx(
                  'flex',
                  msg.rol === 'user' ? 'justify-end' : 'justify-start'
                )}
              >
                <div
                  className={clsx(
                    'max-w-[85%] px-4 py-2 relative group',
                    msg.rol === 'user'
                      ? 'chat-bubble-user'
                      : 'chat-bubble-ai'
                  )}
                >
                  <p className="text-sm whitespace-pre-wrap">{msg.contenido}</p>
                  {msg.rol === 'assistant' && (
                    <button
                      onClick={() => copiarMensaje(msg.contenido, msg.id)}
                      className="absolute -right-8 top-1 opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-gray-600"
                    >
                      {copiado === msg.id ? <Check size={14} /> : <Copy size={14} />}
                    </button>
                  )}
                </div>
              </div>
            ))}

            {enviando && (
              <div className="flex justify-start">
                <div className="chat-bubble-ai px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-purple-500 rounded-full animate-bounce" />
                    <div className="w-2 h-2 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                    <div className="w-2 h-2 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }} />
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="p-3 border-t border-gray-200">
            <div className="flex gap-2">
              <input
                type="text"
                value={mensaje}
                onChange={(e) => setMensaje(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && enviarMensaje()}
                placeholder="Escribe tu mensaje..."
                disabled={enviando}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-full focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 disabled:bg-gray-100"
              />
              <button
                onClick={enviarMensaje}
                disabled={!mensaje.trim() || enviando}
                className="p-2 bg-purple-600 text-white rounded-full hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Send size={18} />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
