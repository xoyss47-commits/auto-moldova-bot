const { Router } = require('express');
const scraperService = require('../services/scraperService');
const calculatorService = require('../services/calculatorService');
const config = require('../../config/default');

const router = Router();

function applyFilters(vehicles, filters = {}) {
  return vehicles.filter(v => {
    if (filters.minYear && v.year < filters.minYear) return false;
    if (filters.maxYear && v.year > filters.maxYear) return false;
    if (filters.minEngineCc && v.engineCc && v.engineCc < filters.minEngineCc) return false;
    if (filters.maxEngineCc && v.engineCc && v.engineCc > filters.maxEngineCc) return false;
    if (filters.fuelType && v.fuelType !== filters.fuelType) return false;
    if (filters.maxPriceUsd && v.finalMoldovaPriceUsd > filters.maxPriceUsd) return false;
    if (filters.minMileage && v.mileageRaw && v.mileageRaw < filters.minMileage) return false;
    if (filters.maxMileage && v.mileageRaw && v.mileageRaw > filters.maxMileage) return false;
    return true;
  });
}

function applySort(vehicles, sortBy = 'year_desc') {
  const sorted = [...vehicles];
  switch (sortBy) {
    case 'year_asc':
      sorted.sort((a, b) => a.year - b.year);
      break;
    case 'price_asc':
      sorted.sort((a, b) => a.finalMoldovaPriceUsd - b.finalMoldovaPriceUsd);
      break;
    case 'price_desc':
      sorted.sort((a, b) => b.finalMoldovaPriceUsd - a.finalMoldovaPriceUsd);
      break;
    case 'mileage_asc':
      sorted.sort((a, b) => (a.mileageRaw || 0) - (b.mileageRaw || 0));
      break;
    case 'mileage_desc':
      sorted.sort((a, b) => (b.mileageRaw || 0) - (a.mileageRaw || 0));
      break;
    case 'year_desc':
    default:
      sorted.sort((a, b) => b.year - a.year);
  }
  return sorted;
}

router.post('/scrape-and-calculate', async (req, res) => {
  const { searchQuery, filters, sortBy } = req.body;

  if (!searchQuery) {
    return res.status(400).json({ error: 'Требуется указать поисковый запрос (searchQuery).' });
  }

  try {
    const vehicles = await scraperService.searchVehicles(searchQuery);

    if (!vehicles || vehicles.length === 0) {
      return res.status(404).json({ message: 'По вашему запросу ничего не найдено. Попробуйте изменить параметры поиска.' });
    }

    let vehiclesWithCalculations = vehicles.map(vehicle => {
      const calculation = calculatorService.calculateFinalPrice(
        vehicle.currentBidUsd, vehicle.engineCc, vehicle.year, vehicle.fuelType);
      return { ...vehicle, ...calculation };
    });

    if (filters && Object.keys(filters).some(k => filters[k] != null && filters[k] !== '')) {
      vehiclesWithCalculations = applyFilters(vehiclesWithCalculations, filters);
    }

    if (sortBy) {
      vehiclesWithCalculations = applySort(vehiclesWithCalculations, sortBy);
    }

    res.json({
      total: vehiclesWithCalculations.length,
      results: vehiclesWithCalculations,
    });
  } catch (error) {
    console.error('[api] Ошибка /scrape-and-calculate:', error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера при поиске или расчете.' });
  }
});

router.post('/calculate', async (req, res) => {
  const { currentBidUsd, engineCc, year, fuelType } = req.body;

  if (currentBidUsd == null || currentBidUsd <= 0 || !year || year < 1990) {
    return res.status(400).json({ error: 'Обязательные поля: currentBidUsd, year.' });
  }

  try {
    const result = calculatorService.calculateFinalPrice(
      Number(currentBidUsd),
      Number(engineCc) || 0,
      Number(year),
      fuelType || 'Бензин'
    );
    res.json(result);
  } catch (error) {
    console.error('[api] Ошибка /calculate:', error);
    res.status(500).json({ error: 'Ошибка при расчете стоимости.' });
  }
});

router.get('/config', (_req, res) => {
  res.json({
    calculator: {
      logisticsCostUsd: config.calculator.logisticsCostUsd,
      commissionRate: config.calculator.commissionRate,
      minCommissionUsd: config.calculator.minCommissionUsd,
      currentYear: config.calculator.currentYear,
      customs: config.calculator.customs,
    },
    fuelTypes: Object.values(config.fuelTypes),
    managerContact: config.telegram.managerContact,
    ui: {
      currency: 'USD',
      currencySymbol: '$',
    },
  });
});

router.get('/health', (_req, res) => {
  res.status(200).json({ success: true, message: 'OK', timestamp: new Date().toISOString() });
});

module.exports = router;
