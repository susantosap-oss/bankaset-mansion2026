import { cn } from '@/lib/utils';

interface KPICardProps {
  label: string;
  value: string | number;
  sub?: string;
  color?: 'blue' | 'emerald' | 'amber' | 'red' | 'gray';
  icon?: React.ReactNode;
}

const colors = {
  blue: 'border-l-blue-500 bg-blue-50',
  emerald: 'border-l-emerald-500 bg-emerald-50',
  amber: 'border-l-amber-500 bg-amber-50',
  red: 'border-l-red-500 bg-red-50',
  gray: 'border-l-gray-400 bg-gray-50',
};

const valueColors = {
  blue: 'text-blue-700',
  emerald: 'text-emerald-700',
  amber: 'text-amber-700',
  red: 'text-red-700',
  gray: 'text-gray-700',
};

export function KPICard({ label, value, sub, color = 'blue', icon }: KPICardProps) {
  return (
    <div className={cn('rounded-xl border-l-4 p-5 flex items-start gap-4', colors[color])}>
      {icon && <div className="text-2xl mt-0.5">{icon}</div>}
      <div>
        <p className="text-sm text-gray-500 font-medium">{label}</p>
        <p className={cn('text-3xl font-bold mt-1', valueColors[color])}>{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
      </div>
    </div>
  );
}
