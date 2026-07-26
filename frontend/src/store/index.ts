import { create } from 'zustand';

export interface Filters {
  minYear: number | '';
  maxYear: number | '';
  minEngineCc: number | '';
  maxEngineCc: number | '';
  fuelType: string;
  maxPriceUsd: number | '';
}

export interface AppConfig {
  fuelTypes: string[];
  managerContact: string;
  calculator: {
    logisticsCostUsd: number;
    commissionRate: number;
    minCommissionUsd: number;
    currentYear: number;
  };
}

export interface Vehicle {
  title: string;
  year: number;
  engineCc: number;
  fuelType: string;
  currentBidUsd: number;
  mileage: string;
  mileageRaw: number;
  location: string;
  color: string;
  images: string[];
  vin: string;
  auctionPrice: number;
  deliveryAndLogistics: number;
  customsTaxMoldova: number;
  vatMoldova: number;
  serviceCommission: number;
  totalPrice: number;
  finalMoldovaPriceUsd: number;
}

interface AppState {
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  vehicles: Vehicle[];
  setVehicles: (v: Vehicle[]) => void;
  loading: boolean;
  setLoading: (b: boolean) => void;
  error: string | null;
  setError: (e: string | null) => void;
  filters: Filters;
  setFilters: (f: Partial<Filters>) => void;
  resetFilters: () => void;
  sortBy: string;
  setSortBy: (s: string) => void;
  config: AppConfig | null;
  setConfig: (c: AppConfig | null) => void;
  lastSearchedQuery: string;
  setLastSearchedQuery: (q: string) => void;
}

const defaultFilters: Filters = {
  minYear: '',
  maxYear: '',
  minEngineCc: '',
  maxEngineCc: '',
  fuelType: '',
  maxPriceUsd: '',
};

const useAppStore = create<AppState>((set) => ({
  searchQuery: '',
  setSearchQuery: (query) => set({ searchQuery: query }),
  vehicles: [],
  setVehicles: (vehicles) => set({ vehicles }),
  loading: false,
  setLoading: (loading) => set({ loading }),
  error: null,
  setError: (error) => set({ error }),
  filters: defaultFilters,
  setFilters: (newFilters) =>
    set((state) => ({ filters: { ...state.filters, ...newFilters } })),
  resetFilters: () => set({ filters: defaultFilters }),
  sortBy: 'year_desc',
  setSortBy: (s) => set({ sortBy: s }),
  config: null,
  setConfig: (c) => set({ config: c }),
  lastSearchedQuery: '',
  setLastSearchedQuery: (q) => set({ lastSearchedQuery: q }),
}));

export default useAppStore;
