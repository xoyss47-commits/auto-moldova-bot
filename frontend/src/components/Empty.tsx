import { cn } from '@/lib/utils';

interface EmptyProps {
  icon?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export default function Empty({
  icon = '🚗💨',
  title,
  description,
  action,
  className,
}: EmptyProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center py-16 px-6 text-center animate-fadeInUp',
        className
      )}
    >
      <div className="text-6xl mb-4">{icon}</div>
      <h3 className="text-xl font-bold text-slate-100 mb-2">{title}</h3>
      {description && (
        <p className="text-slate-400 max-w-sm mb-6">{description}</p>
      )}
      {action}
    </div>
  );
}
