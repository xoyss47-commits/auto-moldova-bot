import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Search, Filter, ArrowUpDown, RotateCcw, Loader2, Car, SlidersHorizontal, X, Sparkles } from 'lucide-react';
import useAppStore, { Vehicle } from '@/store';
import CarCard from '@/components/CarCard';
import CalculationModal from '@/components/CalculationModal';
import Empty from '@/components/Empty';

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        ready?: () => void;
        expand?: () => void;
        setHeaderColor?: (c: string) => void;
        setBackgroundColor?: (c: string) => void;
        openTelegramLink?: (url: string) => void;
        MainButton?: {
          show?: () => void;
          hide?: () => void;
          setText?: (t: string) => void;
          onClick?: (cb: () => void) => void;
        };
        HapticFeedback?: {
          impactOccurred?: (s: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void;
          notificationOccurred?: (t: 'error' | 'success' | 'warning') => void;
          selectionChanged?: () => void;
        };
        themeParams?: { bg_color?: string; header_bg_color?: string };
        initData?: string;
      };
    };
  }
}

const UI_TEXTS = {
  APP_TITLE: '🚗 Автокаталог Молдова',
  APP_SUBTITLE: 'Авто из США/Европы с доставкой и растаможкой «под ключ»',
  SEARCH_PLACEHOLDER: 'Поиск авто (например: BMW M5, Mercedes CLS, Audi Q7)...',
  SEARCH_BUTTON: 'Найти авто',
  SEARCHING: 'Ищу подходящие варианты...',
  FILTERS_TITLE: 'Фильтры и сортировка',
  FILTERS_TOGGLE: 'Фильтры',
  RESET: 'Сбросить',
  YEAR_MIN: 'Год от',
  YEAR_MAX: 'Год до',
  ENGINE_MIN: 'Объем от, см³',
  ENGINE_MAX: 'Объем до, см³',
  FUEL_TYPE: 'Тип топлива',
  ANY: 'Любой',
  MAX_PRICE: 'Бюджет до, $',
  SORT_LABEL: 'Сортировать',
  SORT_OPTIONS: [
    { value: 'year_desc', label: '🔥 Сначала новее' },
    { value: 'year_asc', label: '📅 Сначала старше' },
    { value: 'price_asc', label: '💰 Дешевле сначала' },
    { value: 'price_desc', label: '💵 Дороже сначала' },
    { value: 'mileage_asc', label: '🛣️ Меньше пробег' },
    { value: 'mileage_desc', label: '🛣️ Больше пробег' },
  ],
  NO_RESULTS_TITLE: 'Ничего не найдено 😔',
  NO_RESULTS_DESC: 'Попробуйте изменить поисковый запрос или сбросить фильтры. Также можно написать менеджеру — мы подберём вариант вручную.',
  ERROR_TITLE: 'Ошибка при поиске',
  ERROR_DESC: 'Пожалуйста, попробуйте позже или свяжитесь с менеджером.',
  WELCOME_TITLE: 'Начните поиск автомобиля 🔍',
  WELCOME_DESC: 'Введите марку и модель — мы покажем варианты с расчетом полной стоимости «под ключ» в Молдове (включая доставку $2 200, растаможку и НДС).',
  QUICK_SEARCHES: ['Mercedes CLS 63', 'BMW M5', 'BMW X5', 'Audi Q7', 'Tesla Model S', 'Range Rover Sport', 'Toyota Camry', 'Porsche Cayenne'],
  TOTAL_FOUND: 'Найдено вариантов',
  MANAGER_BTN: '📞 Менеджер',
  APPLY_FILTERS: 'Применить фильтры',
};

const haptic = (type: 'light' | 'medium' | 'heavy' | 'success' | 'error' | 'warning' | 'select' = 'light') => {
  try {
    const w = window.Telegram?.WebApp?.HapticFeedback;
    if (!w) return;
    if (type === 'success') w.notificationOccurred?.('success');
    else if (type === 'error') w.notificationOccurred?.('error');
    else if (type === 'warning') w.notificationOccurred?.('warning');
    else if (type === 'select') w.selectionChanged?.();
    else w.impactOccurred?.(type as any);
  } catch (_) {}
};

const openManager = (contact: string = '@manager_username') => {
  const clean = contact.replace('@', '');
  const url = `https://t.me/${clean}`;
  try {
    if (window.Telegram?.WebApp?.openTelegramLink) {
      window.Telegram.WebApp.openTelegramLink(url);
      return;
    }
  } catch (_) {}
  window.open(url, '_blank', 'noopener,noreferrer');
};

export default function Home() {
  const {
    searchQuery, setSearchQuery,
    vehicles, setVehicles,
    loading, setLoading,
    error, setError,
    filters, setFilters, resetFilters,
    sortBy, setSortBy,
    config, setConfig,
    lastSearchedQuery, setLastSearchedQuery,
  } = useAppStore();

  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [appliedFilters, setAppliedFilters] = useState(filters);
  const [appliedSort, setAppliedSort] = useState(sortBy);

  // Telegram WebApp init
  useEffect(() => {
    try {
      const tg = window.Telegram?.WebApp;
      if (tg) {
        tg.ready?.();
        tg.expand?.();
        try {
          tg.setHeaderColor?.('#020617');
          tg.setBackgroundColor?.('#020617');
        } catch (_) {}
        if (tg.MainButton) {
          tg.MainButton.setText?.('📞 Связаться с менеджером');
          tg.MainButton.onClick?.(() => {
            haptic('medium');
            openManager(config?.managerContact);
          });
          tg.MainButton.show?.();
        }
      }
    } catch (e) {
      console.warn('Telegram WebApp init warning:', e);
    }
  }, [config?.managerContact]);

  // Fetch UI config once
  useEffect(() => {
    (async () => {
      try {
        const { data } = await axios.get('/api/config', { timeout: 5000 });
        setConfig(data);
      } catch (err) {
        console.warn('Config fetch failed, using defaults.', err);
      }
    })();
  }, [setConfig]);

  const hasAnyFilter = useMemo(() => {
    return Object.values(appliedFilters).some(v => v !== '' && v != null);
  }, [appliedFilters]);

  const currentYear = config?.calculator?.currentYear || new Date().getFullYear();
  const fuelTypes = config?.fuelTypes || ['Бензин', 'Дизель', 'Гибрид', 'Электро', 'Газ'];

  const runSearch = async (queryOverride?: string) => {
    const q = (queryOverride ?? searchQuery).trim();
    if (!q) return;

    haptic('medium');
    setLoading(true);
    setError(null);
    setVehicles([]);

    try {
      const { data } = await axios.post(
        '/api/scrape-and-calculate',
        {
          searchQuery: q,
          filters: hasAnyFilter ? appliedFilters : undefined,
          sortBy: appliedSort,
        },
        { timeout: 60000 }
      );

      const list = Array.isArray(data) ? data : data?.results || [];
      setVehicles(list);
      setLastSearchedQuery(q);
      haptic(list.length > 0 ? 'success' : 'warning');

      if (window.Telegram?.WebApp?.MainButton) {
        if (list.length === 0) {
          window.Telegram.WebApp.MainButton.setText?.('📞 Подобрать вручную');
        } else {
          window.Telegram.WebApp.MainButton.setText?.('📞 Связаться с менеджером');
        }
      }
    } catch (err: any) {
      console.error('Search error:', err);
      const msg =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        UI_TEXTS.ERROR_DESC;
      setError(msg);
      setVehicles([]);
      haptic('error');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setAppliedFilters(filters);
    setAppliedSort(sortBy);
    // Force search on next tick with applied filters
    setTimeout(() => runSearch(), 0);
  };

  const handleQuickSearch = (q: string) => {
    setSearchQuery(q);
    haptic('select');
    setAppliedFilters(filters);
    setAppliedSort(sortBy);
    setTimeout(() => runSearch(q), 0);
  };

  const handleApplyFilters = () => {
    setAppliedFilters(filters);
    setAppliedSort(sortBy);
    setShowFilters(false);
    haptic('select');
    if (lastSearchedQuery) {
      setTimeout(() => runSearch(lastSearchedQuery), 0);
    }
  };

  const handleReset = () => {
    resetFilters();
    setAppliedFilters({ minYear: '', maxYear: '', minEngineCc: '', maxEngineCc: '', fuelType: '', maxPriceUsd: '' });
    setSortBy('year_desc');
    setAppliedSort('year_desc');
    haptic('light');
    if (lastSearchedQuery) {
      setTimeout(() => runSearch(lastSearchedQuery), 0);
    }
  };

  const handleDetails = (v: Vehicle) => {
    haptic('select');
    setSelectedVehicle(v);
  };

  const handleOrder = (v: Vehicle) => {
    haptic('heavy');
    setSelectedVehicle(v);
    setTimeout(() => openManager(config?.managerContact), 150);
  };

  return (
    <div className="min-h-screen pb-20">
      {/* Header */}
      <header className="sticky top-0 z-40 backdrop-blur-xl bg-slate-950/80 border-b border-slate-800/60">
        <div className="px-4 sm:px-6 py-4 max-w-6xl mx-auto">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center shadow-lg shadow-green-900/30">
                  <Car size={18} className="text-white" />
                </div>
                <h1 className="text-lg sm:text-xl font-extrabold text-white tracking-tight truncate">
                  {UI_TEXTS.APP_TITLE}
                </h1>
              </div>
              <p className="text-xs text-slate-400 truncate ml-11">{UI_TEXTS.APP_SUBTITLE}</p>
            </div>
            <button
              type="button"
              onClick={() => { haptic('light'); openManager(config?.managerContact); }}
              className="shrink-0 inline-flex items-center gap-1.5 px-3 h-10 rounded-xl bg-green-600/15 hover:bg-green-600/25 border border-green-500/30 text-green-300 text-sm font-semibold transition-colors"
            >
              <Sparkles size={15} />
              <span className="hidden sm:inline">{UI_TEXTS.MANAGER_BTN}</span>
            </button>
          </div>

          {/* Search bar */}
          <form onSubmit={handleSubmit} className="relative">
            <div className="flex items-center gap-2 rounded-2xl bg-slate-900/80 border border-slate-800 focus-within:border-green-500/50 focus-within:ring-2 focus-within:ring-green-500/20 transition-all p-1.5 shadow-lg shadow-black/30">
              <Search size={19} className="ml-3 text-slate-400 shrink-0" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={UI_TEXTS.SEARCH_PLACEHOLDER}
                className="flex-1 min-w-0 bg-transparent text-white placeholder:text-slate-500 text-sm sm:text-base outline-none py-2 px-1"
              />
              <button
                type="button"
                onClick={() => {
                  haptic('select');
                  setShowFilters(s => !s);
                }}
                className={`shrink-0 inline-flex items-center gap-1.5 h-10 px-3 rounded-xl font-medium text-sm transition-colors ${
                  showFilters || hasAnyFilter
                    ? 'bg-green-600/20 border border-green-500/30 text-green-300'
                    : 'bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300'
                }`}
                aria-label="Фильтры"
              >
                <SlidersHorizontal size={16} />
                <span className="hidden sm:inline">{UI_TEXTS.FILTERS_TOGGLE}</span>
                {hasAnyFilter && (
                  <span className="w-5 h-5 rounded-full bg-green-500 text-slate-950 text-[10px] font-bold flex items-center justify-center">
                    {Object.values(appliedFilters).filter(v => v !== '' && v != null).length}
                  </span>
                )}
              </button>
              <button
                type="submit"
                disabled={loading || !searchQuery.trim()}
                className="shrink-0 inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-gradient-to-r from-green-600 to-emerald-500 hover:from-green-500 hover:to-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-sm sm:text-base shadow-lg shadow-green-900/30 transition-all active:scale-[0.98]"
              >
                {loading ? <Loader2 size={17} className="animate-spin" /> : <ArrowUpDown size={17} className="sm:hidden" />}
                <span className="hidden sm:inline">{loading ? UI_TEXTS.SEARCHING : UI_TEXTS.SEARCH_BUTTON}</span>
                <span className="sm:hidden">{loading ? '' : 'Найти'}</span>
              </button>
            </div>
          </form>
        </div>

        {/* Filters panel (collapsible) */}
        {showFilters && (
          <div className="border-t border-slate-800/60 bg-slate-950/95 px-4 sm:px-6 py-5 animate-fadeInUp">
            <div className="max-w-6xl mx-auto">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-white flex items-center gap-2">
                  <Filter size={17} className="text-green-400" />
                  {UI_TEXTS.FILTERS_TITLE}
                </h3>
                <button
                  type="button"
                  onClick={handleReset}
                  className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-slate-400 hover:text-white transition-colors"
                >
                  <RotateCcw size={14} /> {UI_TEXTS.RESET}
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4 mb-5">
                <div>
                  <label className="block text-xs text-slate-400 mb-1.5 font-medium">{UI_TEXTS.YEAR_MIN}</label>
                  <input
                    type="number"
                    min={1990}
                    max={currentYear}
                    value={filters.minYear}
                    onChange={(e) => setFilters({ minYear: e.target.value ? Number(e.target.value) : '' })}
                    placeholder="2018"
                    className="w-full h-10 px-3 rounded-xl bg-slate-900 border border-slate-800 text-white placeholder:text-slate-600 focus:border-green-500/50 focus:outline-none focus:ring-2 focus:ring-green-500/20 transition-all text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1.5 font-medium">{UI_TEXTS.YEAR_MAX}</label>
                  <input
                    type="number"
                    min={1990}
                    max={currentYear}
                    value={filters.maxYear}
                    onChange={(e) => setFilters({ maxYear: e.target.value ? Number(e.target.value) : '' })}
                    placeholder={String(currentYear)}
                    className="w-full h-10 px-3 rounded-xl bg-slate-900 border border-slate-800 text-white placeholder:text-slate-600 focus:border-green-500/50 focus:outline-none focus:ring-2 focus:ring-green-500/20 transition-all text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1.5 font-medium">{UI_TEXTS.ENGINE_MIN}</label>
                  <input
                    type="number"
                    min={0}
                    step={100}
                    value={filters.minEngineCc}
                    onChange={(e) => setFilters({ minEngineCc: e.target.value ? Number(e.target.value) : '' })}
                    placeholder="2000"
                    className="w-full h-10 px-3 rounded-xl bg-slate-900 border border-slate-800 text-white placeholder:text-slate-600 focus:border-green-500/50 focus:outline-none focus:ring-2 focus:ring-green-500/20 transition-all text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1.5 font-medium">{UI_TEXTS.ENGINE_MAX}</label>
                  <input
                    type="number"
                    min={0}
                    step={100}
                    value={filters.maxEngineCc}
                    onChange={(e) => setFilters({ maxEngineCc: e.target.value ? Number(e.target.value) : '' })}
                    placeholder="6000"
                    className="w-full h-10 px-3 rounded-xl bg-slate-900 border border-slate-800 text-white placeholder:text-slate-600 focus:border-green-500/50 focus:outline-none focus:ring-2 focus:ring-green-500/20 transition-all text-sm"
                  />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-xs text-slate-400 mb-1.5 font-medium">{UI_TEXTS.FUEL_TYPE}</label>
                  <select
                    value={filters.fuelType}
                    onChange={(e) => setFilters({ fuelType: e.target.value })}
                    className="w-full h-10 px-3 rounded-xl bg-slate-900 border border-slate-800 text-white focus:border-green-500/50 focus:outline-none focus:ring-2 focus:ring-green-500/20 transition-all text-sm"
                  >
                    <option value="">{UI_TEXTS.ANY}</option>
                    {fuelTypes.map((f) => (
                      <option key={f} value={f}>{f}</option>
                    ))}
                  </select>
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-xs text-slate-400 mb-1.5 font-medium">{UI_TEXTS.MAX_PRICE}</label>
                  <input
                    type="number"
                    min={0}
                    step={500}
                    value={filters.maxPriceUsd}
                    onChange={(e) => setFilters({ maxPriceUsd: e.target.value ? Number(e.target.value) : '' })}
                    placeholder="100000"
                    className="w-full h-10 px-3 rounded-xl bg-slate-900 border border-slate-800 text-white placeholder:text-slate-600 focus:border-green-500/50 focus:outline-none focus:ring-2 focus:ring-green-500/20 transition-all text-sm"
                  />
                </div>
                <div className="col-span-2 sm:col-span-2 lg:col-span-1">
                  <label className="block text-xs text-slate-400 mb-1.5 font-medium">{UI_TEXTS.SORT_LABEL}</label>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl bg-slate-900 border border-slate-800 text-white focus:border-green-500/50 focus:outline-none focus:ring-2 focus:ring-green-500/20 transition-all text-sm"
                  >
                    {UI_TEXTS.SORT_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 sm:justify-end">
                <button
                  type="button"
                  onClick={() => setShowFilters(false)}
                  className="inline-flex items-center justify-center gap-2 h-11 px-5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold border border-slate-700 transition-colors sm:order-1"
                >
                  <X size={16} /> Закрыть
                </button>
                <button
                  type="button"
                  onClick={handleApplyFilters}
                  className="inline-flex items-center justify-center gap-2 h-11 px-5 rounded-xl bg-gradient-to-r from-green-600 to-emerald-500 hover:from-green-500 hover:to-emerald-400 text-white font-bold shadow-lg shadow-green-900/30 transition-all active:scale-[0.98]"
                >
                  ✅ {UI_TEXTS.APPLY_FILTERS}
                </button>
              </div>
            </div>
          </div>
        )}
      </header>

      {/* Main content */}
      <main className="px-4 sm:px-6 py-6 max-w-6xl mx-auto">
        {/* Quick searches (only when no results + not loading) */}
        {!loading && vehicles.length === 0 && !error && (
          <div className="mb-6 animate-fadeInUp">
            <div className="text-xs uppercase tracking-wider text-slate-500 font-bold mb-3">
              💡 Быстрый поиск — популярные запросы
            </div>
            <div className="flex flex-wrap gap-2">
              {UI_TEXTS.QUICK_SEARCHES.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => handleQuickSearch(q)}
                  className="px-3.5 py-2 rounded-full bg-slate-900/70 hover:bg-slate-800 border border-slate-800 hover:border-green-500/30 text-slate-300 hover:text-white text-sm font-medium transition-all"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="py-16 flex flex-col items-center justify-center text-center animate-fadeInUp">
            <div className="w-20 h-20 rounded-full bg-green-500/10 border border-green-500/20 flex items-center justify-center mb-5 animate-pulseSlow">
              <Car size={36} className="text-green-400" />
            </div>
            <div className="text-lg font-bold text-white mb-2">{UI_TEXTS.SEARCHING}</div>
            <div className="text-sm text-slate-400 max-w-md">
              Парсим аукцион, анализируем цены и рассчитываем растаможку в Молдове...
              <br />Обычно это занимает 5–15 секунд ⏳
            </div>
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <Empty
            icon="⚠️"
            title={UI_TEXTS.ERROR_TITLE}
            description={String(error)}
            action={
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  type="button"
                  onClick={() => lastSearchedQuery && runSearch(lastSearchedQuery)}
                  className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold border border-slate-700 transition-colors"
                >
                  <RotateCcw size={17} /> Повторить
                </button>
                <button
                  type="button"
                  onClick={() => openManager(config?.managerContact)}
                  className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-green-600 to-emerald-500 hover:from-green-500 hover:to-emerald-400 text-white font-bold shadow-lg shadow-green-900/30 transition-all"
                >
                  📞 {UI_TEXTS.MANAGER_BTN}
                </button>
              </div>
            }
          />
        )}

        {/* Empty / Welcome */}
        {!loading && !error && vehicles.length === 0 && !lastSearchedQuery && (
          <Empty
            icon="🚗✨"
            title={UI_TEXTS.WELCOME_TITLE}
            description={UI_TEXTS.WELCOME_DESC}
          />
        )}

        {/* No results after search */}
        {!loading && !error && vehicles.length === 0 && lastSearchedQuery && (
          <Empty
            icon="🔍"
            title={UI_TEXTS.NO_RESULTS_TITLE}
            description={UI_TEXTS.NO_RESULTS_DESC}
            action={
              <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={handleReset}
                  className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold border border-slate-700 transition-colors"
                >
                  <RotateCcw size={16} /> Сбросить фильтры
                </button>
                <button
                  type="button"
                  onClick={() => openManager(config?.managerContact)}
                  className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-green-600 to-emerald-500 hover:from-green-500 hover:to-emerald-400 text-white font-bold shadow-lg shadow-green-900/30 transition-all"
                >
                  📞 Подобрать вручную
                </button>
              </div>
            }
          />
        )}

        {/* Results */}
        {!loading && vehicles.length > 0 && (
          <>
            <div className="flex items-center justify-between mb-4 sm:mb-5 animate-fadeInUp">
              <div>
                <div className="text-xs uppercase tracking-wider text-slate-500 font-bold mb-1">
                  {lastSearchedQuery && <span className="text-slate-300">«{lastSearchedQuery}» — </span>}
                  {UI_TEXTS.TOTAL_FOUND}
                </div>
                <div className="text-2xl sm:text-3xl font-extrabold gradient-text-green">
                  {vehicles.length}
                </div>
              </div>
              {hasAnyFilter && (
                <button
                  type="button"
                  onClick={handleReset}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs sm:text-sm font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition-colors border border-slate-800"
                >
                  <RotateCcw size={13} /> {UI_TEXTS.RESET}
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 sm:gap-6">
              {vehicles.map((v, i) => (
                <CarCard
                  key={`${v.vin || v.title}-${i}`}
                  vehicle={v}
                  index={i}
                  onDetailsClick={handleDetails}
                  onOrderClick={handleOrder}
                />
              ))}
            </div>

            {/* Bottom CTA */}
            <div className="mt-10 glass-card rounded-3xl p-6 sm:p-8 text-center animate-fadeInUp">
              <div className="text-3xl sm:text-4xl mb-3">🤝</div>
              <h3 className="text-xl sm:text-2xl font-extrabold text-white mb-2">
                Нужна помощь с выбором?
              </h3>
              <p className="text-slate-400 mb-5 max-w-xl mx-auto">
                Наши менеджеры подберут для вас лучший вариант по бюджету и пожеланиям,
                проведут диагностику и организуют доставку до двери в Молдове.
              </p>
              <button
                type="button"
                onClick={() => { haptic('medium'); openManager(config?.managerContact); }}
                className="inline-flex items-center gap-2 px-7 py-4 rounded-2xl bg-gradient-to-r from-green-600 to-emerald-500 hover:from-green-500 hover:to-emerald-400 active:scale-[0.98] text-white font-bold text-base shadow-xl shadow-green-900/40 transition-all"
              >
                📞 Связаться с менеджером {config?.managerContact || ''}
              </button>
            </div>
          </>
        )}
      </main>

      {/* Modal */}
      {selectedVehicle && (
        <CalculationModal
          vehicle={selectedVehicle}
          onClose={() => { haptic('light'); setSelectedVehicle(null); }}
          onOrder={() => {
            haptic('heavy');
            openManager(config?.managerContact);
          }}
          managerContact={config?.managerContact}
        />
      )}
    </div>
  );
}
