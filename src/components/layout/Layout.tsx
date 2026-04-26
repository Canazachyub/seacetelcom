import { useState } from 'react';
import type { ReactNode } from 'react';
import { useStore } from '../../store/useStore';
import { Button } from '../ui/Button';
import {
  LayoutDashboard,
  FileText,
  Star,
  Map,
  Settings,
  MessageSquare,
  RefreshCw,
  Menu,
  Bell,
  ChevronLeft,
  Database,
  Activity,
  Sparkles,
  FolderKanban
} from 'lucide-react';
import { clsx } from 'clsx';
interface LayoutProps {
  children: ReactNode;
}
export function Layout({ children }: LayoutProps) {
  const vistaActiva = useStore(s => s.vistaActiva);
  const setVistaActiva = useStore(s => s.setVistaActiva);
  const cargarTodo = useStore(s => s.cargarTodo);
  const cargando = useStore(s => s.cargando);
  const chatAbierto = useStore(s => s.chatAbierto);
  const setChatAbierto = useStore(s => s.setChatAbierto);
  const procesos = useStore(s => s.procesos);
  const seguimiento = useStore(s => s.seguimiento);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, count: null as number | null },
    { id: 'procesos', label: 'Procesos', icon: FileText, count: procesos.length || null },
    { id: 'seguimiento', label: 'Seguimiento', icon: Star, count: seguimiento.length || null },
    { id: 'mapa', label: 'Mapa', icon: Map, count: null as number | null },
    { id: 'ocds', label: 'OCDS API', icon: Database, count: null as number | null },
    { id: 'historicos', label: 'Históricos', icon: Sparkles, count: null as number | null },
    { id: 'grupos', label: 'Mis Grupos', icon: FolderKanban, count: null as number | null },
    { id: 'diagnostico', label: 'Diagnóstico', icon: Activity, count: null as number | null },
  ] as const;
  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <aside
        className={clsx(
          'bg-white border-r border-gray-200 flex flex-col transition-all duration-300',
          sidebarOpen ? 'w-64' : 'w-16'
        )}
      >
        {/* Logo */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-gray-200">
          {sidebarOpen && (
            <div className="flex items-center gap-2">
              <span className="text-2xl">🏛️</span>
              <span className="font-bold text-gray-900">SEACE Intelligence</span>
            </div>
          )}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-500"
          >
            {sidebarOpen ? <ChevronLeft size={20} /> : <Menu size={20} />}
          </button>
        </div>
        {/* Navigation */}
        <nav className="flex-1 p-2 space-y-1">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = vistaActiva === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setVistaActiva(item.id)}
                title={item.count != null ? `${item.label} (${item.count.toLocaleString('es-PE')})` : item.label}
                className={clsx(
                  'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors',
                  isActive
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-100'
                )}
              >
                <Icon size={20} />
                {sidebarOpen && (
                  <>
                    <span className="font-medium flex-1 text-left">{item.label}</span>
                    {item.count != null && (
                      <span className={clsx(
                        'text-xs font-mono px-1.5 py-0.5 rounded',
                        isActive ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'
                      )}>
                        {item.count.toLocaleString('es-PE')}
                      </span>
                    )}
                  </>
                )}
              </button>
            );
          })}
        </nav>
        {/* Footer */}
        <div className="p-2 border-t border-gray-200">
          <button
            onClick={() => setVistaActiva('settings' as any)}
            className={clsx(
              'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors',
              'text-gray-600 hover:bg-gray-100'
            )}
          >
            <Settings size={20} />
            {sidebarOpen && <span className="font-medium">Configuración</span>}
          </button>
        </div>
      </aside>
      {/* Main content */}
      <div className="flex-1 flex flex-col min-h-screen">
        {/* Header */}
        <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">
              {menuItems.find(m => m.id === vistaActiva)?.label || 'SEACE Intelligence'}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              icon={<RefreshCw size={16} className={cargando ? 'animate-spin' : ''} />}
              onClick={() => cargarTodo()}
              loading={cargando}
            >
              {cargando ? 'Cargando...' : 'Actualizar'}
            </Button>
            <button
              className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 relative"
              title="Notificaciones"
              aria-label="Notificaciones"
            >
              <Bell size={20} />
              <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
            </button>
            <button
              onClick={() => setChatAbierto(!chatAbierto)}
              title={chatAbierto ? 'Cerrar chat IA' : 'Abrir chat IA'}
              aria-label="Asistente IA"
              className={clsx(
                'p-2 rounded-lg transition-colors',
                chatAbierto
                  ? 'bg-purple-100 text-purple-700'
                  : 'hover:bg-gray-100 text-gray-500'
              )}
            >
              <MessageSquare size={20} />
            </button>
          </div>
        </header>
        {/* Page content */}
        <main className="flex-1 p-6 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
