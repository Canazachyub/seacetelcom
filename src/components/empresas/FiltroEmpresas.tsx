import React, { useState, useEffect } from 'react';
import { Zap, Plus, X } from 'lucide-react';
import * as api from '../../services/api';
import type { EmpresaElectrica } from '../../types';

export const FiltroEmpresas: React.FC = () => {
  const [empresas, setEmpresas] = useState<EmpresaElectrica[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newEmpresa, setNewEmpresa] = useState({
    nombreCompleto: '',
    nombreCorto: '',
    patronBusqueda: '',
    colorHex: '#E0E0E0'
  });

  useEffect(() => {
    cargarEmpresas();
  }, []);

  const cargarEmpresas = async () => {
    setLoading(true);
    try {
      const data = await api.getEmpresasElectricas();
      setEmpresas(data);
    } catch (error) {
      console.error('Error cargando empresas:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async (item: number, activo: boolean) => {
    try {
      await api.toggleEmpresaElectrica(item, !activo);
      await cargarEmpresas();
    } catch (error) {
      console.error('Error toggling empresa:', error);
    }
  };

  const handleAdd = async () => {
    if (!newEmpresa.nombreCorto || !newEmpresa.patronBusqueda) {
      alert('Nombre corto y patrón de búsqueda son requeridos');
      return;
    }

    try {
      await api.addEmpresaElectrica(
        newEmpresa.nombreCompleto,
        newEmpresa.nombreCorto,
        newEmpresa.patronBusqueda,
        newEmpresa.colorHex
      );
      setNewEmpresa({
        nombreCompleto: '',
        nombreCorto: '',
        patronBusqueda: '',
        colorHex: '#E0E0E0'
      });
      setShowAddForm(false);
      await cargarEmpresas();
    } catch (error) {
      console.error('Error adding empresa:', error);
    }
  };

  if (loading) {
    return <div className="animate-pulse p-4">Cargando empresas eléctricas...</div>;
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Zap className="text-yellow-500" size={24} />
          <h2 className="text-xl font-bold">Empresas Eléctricas</h2>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="flex items-center gap-2 px-3 py-2 bg-green-500 text-white rounded hover:bg-green-600 transition"
        >
          {showAddForm ? <X size={16} /> : <Plus size={16} />}
          {showAddForm ? 'Cancelar' : 'Agregar'}
        </button>
      </div>

      {showAddForm && (
        <div className="mb-4 p-4 border border-gray-200 rounded bg-gray-50">
          <h3 className="font-semibold mb-3">Nueva Empresa Eléctrica</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">Nombre Completo</label>
              <input
                type="text"
                value={newEmpresa.nombreCompleto}
                onChange={(e) => setNewEmpresa({ ...newEmpresa, nombreCompleto: e.target.value })}
                className="w-full px-3 py-2 border rounded"
                placeholder="Empresa de Servicio Público..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Nombre Corto *</label>
              <input
                type="text"
                value={newEmpresa.nombreCorto}
                onChange={(e) => setNewEmpresa({ ...newEmpresa, nombreCorto: e.target.value })}
                className="w-full px-3 py-2 border rounded"
                placeholder="EMPRESA"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Patrón de Búsqueda (Regex) *</label>
              <input
                type="text"
                value={newEmpresa.patronBusqueda}
                onChange={(e) => setNewEmpresa({ ...newEmpresa, patronBusqueda: e.target.value })}
                className="w-full px-3 py-2 border rounded"
                placeholder="EMPRESA|OTRO_PATRON"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Color (Hex)</label>
              <input
                type="color"
                value={newEmpresa.colorHex}
                onChange={(e) => setNewEmpresa({ ...newEmpresa, colorHex: e.target.value })}
                className="w-full px-3 py-2 border rounded"
              />
            </div>
          </div>
          <button
            onClick={handleAdd}
            className="mt-3 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition"
          >
            Guardar
          </button>
        </div>
      )}

      <div className="space-y-2">
        {empresas.map((empresa) => (
          <div
            key={empresa.item}
            className="flex items-center justify-between p-3 border border-gray-200 rounded hover:bg-gray-50 transition"
            style={{ borderLeftColor: empresa.colorHex, borderLeftWidth: '4px' }}
          >
            <div className="flex items-center gap-3">
              <span
                className="w-4 h-4 rounded"
                style={{ backgroundColor: empresa.colorHex }}
              />
              <div>
                <div className="font-medium">{empresa.nombreCorto}</div>
                <div className="text-sm text-gray-500">{empresa.nombreCompleto}</div>
                <div className="text-xs text-gray-400 font-mono">{empresa.patronBusqueda}</div>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={empresa.activo}
                onChange={() => handleToggle(empresa.item, empresa.activo)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>
        ))}
      </div>

      <div className="mt-4 text-sm text-gray-500">
        Total: {empresas.length} empresas eléctricas configuradas
      </div>
    </div>
  );
};
