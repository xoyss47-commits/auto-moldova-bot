import React, { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, MapPin, Fuel, Calendar, Gauge, Sparkles, PhoneCall, Info, Zap } from 'lucide-react';
import { Vehicle } from '@/store';

interface CarCardProps {
  vehicle: Vehicle;
  onDetailsClick: (vehicle: Vehicle) => void;
  onOrderClick: (vehicle: Vehicle) => void;
  index?: number;
}

const formatPrice = (price: number) =>
  new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(price || 0);

const CarCard: React.FC<CarCardProps> = ({ vehicle, onDetailsClick, onOrderClick, index = 0 }) => {
  const [currentImage, setCurrentImage] = useState(0);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);

  const images = vehicle.images && vehicle.images.length > 0 ? vehicle.images : [];
  const totalImages = images.length;

  const nextImage = useCallback(() => {
    if (totalImages <= 1) return;
    setCurrentImage((prev) => (prev + 1) % totalImages);
  }, [totalImages]);

  const prevImage = useCallback(() => {
    if (totalImages <= 1) return;
    setCurrentImage((prev) => (prev - 1 + totalImages) % totalImages);
  }, [totalImages]);

  useEffect(() => {
    if (totalImages <= 1) return;
    const interval = setInterval(nextImage, 4500);
    return () => clearInterval(interval);
  }, [totalImages, nextImage]);

  const onTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };
  const onTouchMove = (e: React.TouchEvent) => setTouchEnd(e.targetTouches[0].clientX);
  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    const diff = touchStart - touchEnd;
    if (Math.abs(diff) > 50) {
      if (diff > 0) nextImage();
      else prevImage();
    }
  };

  return (
    <div
      className="glass-card glass-card-hover rounded-2xl overflow-hidden flex flex-col h-full animate-fadeInUp"
      style={{ animationDelay: `${Math.min(index * 60, 500)}ms` }}
    >
      {/* Image Gallery / Slider */}
      <div
        className="relative aspect-[4/3] bg-slate-950 overflow-hidden select-none"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {totalImages > 0 ? (
          <img
            src={images[currentImage]}
            alt={vehicle.title}
            className="w-full h-full object-cover transition-all duration-500 ease-out"
            draggable={false}
            loading="lazy"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).src =
                `https://picsum.photos/seed/fallback${index + currentImage}/800/600`;
            }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-slate-500 text-6xl">🚙</div>
        )}

        {/* Gradient overlay */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-slate-950/90 via-slate-950/30 to-transparent" />

        {/* Prev/Next buttons */}
        {totalImages > 1 && (
          <>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); prevImage(); }}
              className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/50 backdrop-blur text-white border border-white/10 flex items-center justify-center hover:bg-black/70 active:scale-95 transition-all"
              aria-label="Предыдущее фото"
            >
              <ChevronLeft size={18} strokeWidth={2.5} />
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); nextImage(); }}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/50 backdrop-blur text-white border border-white/10 flex items-center justify-center hover:bg-black/70 active:scale-95 transition-all"
              aria-label="Следующее фото"
            >
              <ChevronRight size={18} strokeWidth={2.5} />
            </button>

            {/* Dots */}
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
              {images.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setCurrentImage(i); }}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    i === currentImage ? 'w-6 bg-green-400' : 'w-1.5 bg-white/40 hover:bg-white/70'
                  }`}
                  aria-label={`Фото ${i + 1}`}
                />
              ))}
            </div>

            {/* Image counter */}
            <div className="absolute top-3 right-3 px-2.5 py-1 rounded-full bg-black/60 backdrop-blur text-white text-xs font-medium border border-white/10">
              {currentImage + 1} / {totalImages}
            </div>
          </>
        )}

        {/* Fuel type badge */}
        {vehicle.fuelType && (
          <div className="absolute top-3 left-3 px-2.5 py-1 rounded-full bg-slate-900/80 backdrop-blur text-white text-xs font-medium border border-slate-700/60 flex items-center gap-1">
            {vehicle.fuelType === 'Электро' ? (
              <Zap size={12} className="text-yellow-300" />
            ) : (
              <Fuel size={12} className="text-green-400" />
            )}
            {vehicle.fuelType}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-4 sm:p-5 flex flex-col flex-grow">
        <h3 className="text-lg sm:text-xl font-bold text-white mb-3 leading-tight line-clamp-2">
          {vehicle.title}
        </h3>

        {/* Spec tags */}
        <div className="flex flex-wrap gap-2 mb-4">
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-300 text-xs font-medium">
            <Calendar size={13} /> {vehicle.year}
          </span>
          {vehicle.engineCc > 0 && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-300 text-xs font-medium">
              <Sparkles size={13} /> {vehicle.engineCc.toLocaleString('ru-RU')} см³
            </span>
          )}
          {vehicle.mileage && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs font-medium">
              <Gauge size={13} /> {vehicle.mileage}
            </span>
          )}
          {vehicle.location && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-500/10 border border-slate-500/20 text-slate-300 text-xs font-medium">
              <MapPin size={13} /> {vehicle.location}
            </span>
          )}
        </div>

        {/* Final price */}
        <div className="mt-auto pt-2 pb-4 border-t border-slate-800/60 mb-4">
          <div className="text-xs uppercase tracking-wider text-slate-400 mb-1">Стоимость «под ключ» в Молдове</div>
          <div className="text-2xl sm:text-3xl font-extrabold gradient-text-green flex items-baseline gap-2">
            {formatPrice(vehicle.finalMoldovaPriceUsd)}
          </div>
          <div className="text-xs text-slate-500 mt-1">Включая логистику ($2 200), растаможку, НДС и комиссию</div>
        </div>

        {/* Action buttons */}
        <div className="flex flex-col gap-2 sm:flex-row sm:gap-3 mt-auto">
          <button
            type="button"
            onClick={() => onDetailsClick(vehicle)}
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-[0.98] text-white font-semibold border border-slate-700 transition-all"
          >
            <Info size={16} />
            Подробнее
          </button>
          <button
            type="button"
            onClick={() => onOrderClick(vehicle)}
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-green-600 to-emerald-500 hover:from-green-500 hover:to-emerald-400 active:scale-[0.98] text-white font-bold shadow-lg shadow-green-900/30 transition-all"
          >
            <PhoneCall size={16} />
            Заказать
          </button>
        </div>
      </div>
    </div>
  );
};

export default CarCard;
