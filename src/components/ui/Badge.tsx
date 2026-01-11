import { clsx } from 'clsx';
import type { ReactNode } from 'react';

interface BadgeProps {
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'purple';
  size?: 'sm' | 'md';
  children: ReactNode;
  className?: string;
}

export function Badge({ variant = 'default', size = 'sm', children, className }: BadgeProps) {
  const variants = {
    default: 'bg-gray-100 text-gray-800 border-gray-200',
    success: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    warning: 'bg-amber-100 text-amber-800 border-amber-200',
    danger: 'bg-red-100 text-red-800 border-red-200',
    info: 'bg-blue-100 text-blue-800 border-blue-200',
    purple: 'bg-purple-100 text-purple-800 border-purple-200',
  };

  const sizes = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-2.5 py-1 text-sm',
  };

  return (
    <span
      className={clsx(
        'inline-flex items-center font-medium rounded-full border',
        variants[variant],
        sizes[size],
        className
      )}
    >
      {children}
    </span>
  );
}

// Badges específicos para estados
export function EstadoBadge({ estado }: { estado: string }) {
  const config: Record<string, { variant: BadgeProps['variant']; label: string }> = {
    EN_PLAZO: { variant: 'success', label: 'En Plazo' },
    PROXIMO: { variant: 'warning', label: 'Próximo' },
    VENCIDO: { variant: 'danger', label: 'Vencido' },
    PENDIENTE: { variant: 'default', label: 'Pendiente' },
    INSCRITO: { variant: 'success', label: 'Inscrito' },
    DESCARTADO: { variant: 'danger', label: 'Descartado' },
  };

  const { variant, label } = config[estado] || { variant: 'default', label: estado };
  return <Badge variant={variant}>{label}</Badge>;
}

export function PrioridadBadge({ prioridad }: { prioridad: string }) {
  const config: Record<string, { variant: BadgeProps['variant']; label: string }> = {
    ALTA: { variant: 'danger', label: 'Alta' },
    MEDIA: { variant: 'warning', label: 'Media' },
    BAJA: { variant: 'default', label: 'Baja' },
  };

  const { variant, label } = config[prioridad] || { variant: 'default', label: prioridad };
  return <Badge variant={variant}>{label}</Badge>;
}

export function ObjetoBadge({ objeto }: { objeto: string }) {
  const config: Record<string, { variant: BadgeProps['variant'] }> = {
    'Servicio': { variant: 'info' },
    'Bien': { variant: 'success' },
    'Obra': { variant: 'warning' },
    'Consultoría de Obra': { variant: 'purple' },
  };

  const { variant } = config[objeto] || { variant: 'default' };
  return <Badge variant={variant}>{objeto}</Badge>;
}

// v3.1: Badge para estado de fecha (antigüedad del proceso)
export function EstadoFechaBadge({ estado }: { estado: string | null }) {
  if (!estado) return <span className="text-gray-400 text-xs">-</span>;

  const config: Record<string, { variant: BadgeProps['variant']; label: string }> = {
    'ESTA SEMANA': { variant: 'success', label: 'Esta semana' },
    'ESTE MES': { variant: 'info', label: 'Este mes' },
    'ULTIMO TRIMESTRE': { variant: 'warning', label: 'Últ. trimestre' },
    'ANTIGUO': { variant: 'default', label: 'Antiguo' },
  };

  const { variant, label } = config[estado] || { variant: 'default', label: estado };
  return <Badge variant={variant} size="sm">{label}</Badge>;
}

// v3.1: Badge para empresa corta (clasificación de empresa eléctrica)
export function EmpresaCortaBadge({ empresa }: { empresa: string | null }) {
  if (!empresa) return <span className="text-gray-400 text-xs">-</span>;

  // Colores por categoría de empresa
  const getVariant = (emp: string): BadgeProps['variant'] => {
    // Distribuidoras principales
    if (['ELSE', 'HIDRANDINA', 'ELECTRONOROESTE', 'ELECTROCENTRO', 'SEAL', 'ELECTROSUR', 'ELECTRO PUNO', 'ELECTRO ORIENTE', 'ELECTRO UCAYALI', 'ADINELSA'].includes(emp)) {
      return 'info';
    }
    // Generadoras
    if (['ELECTROPERÚ', 'SAN GABÁN', 'EGASA', 'EGEMSA', 'EGESUR'].includes(emp)) {
      return 'purple';
    }
    // Reguladores
    if (['OSINERGMIN', 'COES', 'MEM', 'PROINVERSIÓN'].includes(emp)) {
      return 'warning';
    }
    // Municipales
    if (['EMSEMSA', 'EMSEUSA'].includes(emp)) {
      return 'success';
    }
    return 'default';
  };

  return <Badge variant={getVariant(empresa)} size="sm">{empresa}</Badge>;
}

// v3.1: Badge para tipo de servicio
export function TipoServicioBadge({ tipo }: { tipo: string | null }) {
  if (!tipo) return <span className="text-gray-400 text-xs">-</span>;

  const config: Record<string, { variant: BadgeProps['variant'] }> = {
    'MANTENIMIENTO': { variant: 'info' },
    'SUPERVISIÓN': { variant: 'purple' },
    'CONSULTORÍA': { variant: 'warning' },
    'CONSTRUCCIÓN': { variant: 'success' },
    'SUMINISTRO': { variant: 'default' },
    'ESTUDIOS': { variant: 'info' },
    'LIMPIEZA': { variant: 'default' },
    'SEGURIDAD': { variant: 'danger' },
    'TRANSPORTE': { variant: 'default' },
    'CAPACITACIÓN': { variant: 'warning' },
    'SISTEMAS': { variant: 'info' },
    'LEGAL': { variant: 'purple' },
    'CONTABILIDAD': { variant: 'default' },
    'COMUNICACIÓN': { variant: 'info' },
    'REDES': { variant: 'info' },
    'MEDIDORES': { variant: 'success' },
    'TRANSFORMADORES': { variant: 'warning' },
    'POSTES': { variant: 'default' },
    'CONDUCTORES': { variant: 'info' },
    'ALUMBRADO': { variant: 'warning' },
    'FACTURACIÓN': { variant: 'default' },
    'COBRANZA': { variant: 'danger' },
    'OTROS': { variant: 'default' },
  };

  const { variant } = config[tipo] || { variant: 'default' };
  return <Badge variant={variant} size="sm">{tipo}</Badge>;
}
