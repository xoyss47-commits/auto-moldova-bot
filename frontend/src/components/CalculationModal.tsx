import React, { useEffect } from 'react';
import { X, CheckCircle2, AlertCircle, Package, Truck, FileText, Percent, Receipt } from 'lucide-react';
import { Vehicle } from '@/store';

interface CalculationModalProps {
  vehicle: Vehicle;
  onClose: () => void;
  onOrder?: () => void;
  managerContact?: string;
}

const formatPrice = (price: number) =>
  new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(price || 0);

const Row: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string;
  muted?: boolean;
  highlight?: boolean;
  border?: boolean;
}> = ({ icon, label, value, muted, highlight, border }) => (
  <div
    className={`flex items-center justify-between py-3 ${
      border ? 'border-b border-slate-800/60 last:border-none' : ''
    }`}
  >
    <div className={`flex items-center gap-3 ${muted ? 'text-slate-400' : 'text-slate-200'}`}>
      <div
        className={`w-9 h-9 rounded-lg flex items-center justify-center ${
          highlight ? 'bg-green-500/15 text-green-400' : 'bg-slate-800 text-slate-400'
        }`}
      >
        {icon}
      </div>
      <span className="text-sm sm:text-base font-medium">{label}</span>
    </div>
    <span
      className={`text-sm sm:text-base font-bold ${
        highlight ? 'text-green-400 text-lg' : muted ? 'text-slate-400' : 'text-white'
      }`}
    >
      {value}
    </span>
  </div>
);

const CalculationModal: React.FC<CalculationModalProps> = ({
  vehicle,
  onClose,
  onOrder,
  managerContact = '@manager_username',
}) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  const commissionRateText = vehicle.serviceCommission
    ? `${Math.max(5, Math.round((vehicle.serviceCommission / (vehicle.auctionPrice || 1)) * 100))}%`
    : '5%';

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm animate-fadeInUp" />

      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full sm:max-w-lg bg-slate-900 rounded-t-3xl sm:rounded-3xl border border-slate-800 shadow-2xl shadow-black/60 overflow-hidden animate-fadeInUp"
        style={{ maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 bg-gradient-to-b from-slate-900 via-slate-900 to-slate-900/95 backdrop-blur px-5 sm:px-6 pt-5 pb-4 border-b border-slate-800/60">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="text-xs uppercase tracking-wider text-green-400 font-bold mb-1">Детализация расчета</div>
              <h2 className="text-lg sm:text-xl font-extrabold text-white leading-tight line-clamp-2 pr-6">
                {vehicle.title}
              </h2>
            </div>
            <button
              onClick={onClose}
              aria-label="Закрыть"
              className="shrink-0 -mt-1 -mr-1 w-10 h-10 rounded-full flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <X size={22} />
            </button>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="overflow-y-auto px-5 sm:px-6 py-4 flex-1 no-scrollbar">
          {/* Vehicle thumb */}
          {vehicle.images && vehicle.images.length > 0 && (
            <div className="mb-5 rounded-2xl overflow-hidden border border-slate-800/70 aspect-[16/9] bg-slate-950">
              <img
                src={vehicle.images[0]}
                alt={vehicle.title}
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).src =
                    'https://picsum.photos/seed/calcmodal/800/450';
                }}
              />
            </div>
          )}

          {/* Breakdown */}
          <div className="glass-card rounded-2xl p-4 mb-5">
            <Row
              icon={<Package size={17} />}
              label="Цена авто на аукционе"
              value={formatPrice(vehicle.auctionPrice)}
              border
            />
            <Row
              icon={<Truck size={17} />}
              label="Доставка и логистика (США/Европа → Молдова)"
              value={formatPrice(vehicle.deliveryAndLogistics)}
              border
            />
            <Row
              icon={<FileText size={17} />}
              label="Растаможка Молдова"
              value={formatPrice(vehicle.customsTaxMoldova)}
              border
            />
            <Row
              icon={<Receipt size={17} />}
              label="НДС Молдова (20%)"
              value={formatPrice(vehicle.vatMoldova || 0)}
              border
            />
            <Row
              icon={<Percent size={17} />}
              label={`Комиссия сервиса (мин $500 / ${commissionRateText})`}
              value={formatPrice(vehicle.serviceCommission)}
              border
            />
            <Row
              icon={<CheckCircle2 size={17} />}
              label="Итоговая цена «под ключ»"
              value={formatPrice(vehicle.finalMoldovaPriceUsd)}
              highlight
            />
          </div>

          {/* Info note */}
          <div className="flex gap-3 rounded-2xl bg-blue-500/8 border border-blue-500/20 p-4 mb-5">
            <AlertCircle size={20} className="text-blue-400 shrink-0 mt-0.5" />
            <div className="text-xs sm:text-sm text-blue-200/90 leading-relaxed">
              <span className="font-semibold text-blue-300 block mb-1">ℹ️ Это предварительный расчет</span>
              Окончательная стоимость зависит от актуального курса, таможенной оценки и выбранного способа доставки.
              Для точного расчета свяжитесь с менеджером {managerContact}.
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div className="sticky bottom-0 bg-slate-900/95 backdrop-blur border-t border-slate-800/60 px-5 sm:px-6 py-4 flex flex-col sm:flex-row gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-5 py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 active:scale-[0.98] text-white font-semibold border border-slate-700 transition-all"
          >
            Закрыть
          </button>
          <button
            onClick={onOrder}
            className="flex-1 px-5 py-3 rounded-2xl bg-gradient-to-r from-green-600 to-emerald-500 hover:from-green-500 hover:to-emerald-400 active:scale-[0.98] text-white font-bold shadow-lg shadow-green-900/40 transition-all"
          >
            📞 Заказать / Консультация
          </button>
        </div>
      </div>
    </div>
  );
};

export default CalculationModal;
