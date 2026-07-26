const config = require('../../config/default');

function getVehicleAge(year) {
  const age = config.calculator.currentYear - year;
  return Math.max(0, age);
}

function getAgeBracket(vehicleAge) {
  const brackets = config.calculator.customs.ageBrackets;
  for (const bracket of brackets) {
    if (vehicleAge <= bracket.maxAge) {
      return bracket;
    }
  }
  return brackets[brackets.length - 1];
}

function calculateCustomsTax(year, engineCc, fuelType = 'Бензин') {
  if (!year || !engineCc || engineCc <= 0) {
    if (fuelType === 'Электро') {
      const age = getVehicleAge(year || config.calculator.currentYear);
      const bracket = getAgeBracket(age);
      const equivalentCc = 2000;
      return Math.round(equivalentCc * bracket.ratePerCc * 0.5);
    }
    return 0;
  }

  const vehicleAge = getVehicleAge(year);
  const bracket = getAgeBracket(vehicleAge);
  let ratePerCc = bracket.ratePerCc;

  if (fuelType === 'Электро') {
    ratePerCc = config.calculator.customs.electricRatePerCc;
    const equivalentCc = 2500;
    return Math.round(equivalentCc * ratePerCc * (1 + vehicleAge * 0.08));
  }

  if (fuelType === 'Гибрид') {
    ratePerCc *= config.calculator.customs.hybridMultiplier;
  }

  if (fuelType === 'Дизель') {
    ratePerCc *= 1.15;
  }

  let baseTax = engineCc * ratePerCc;

  if (vehicleAge > 10) {
    baseTax *= 1 + (vehicleAge - 10) * 0.05;
  }

  if (engineCc > 4000) {
    baseTax *= 1.25;
  } else if (engineCc > 3000) {
    baseTax *= 1.1;
  }

  return Math.round(baseTax);
}

function calculateVat(auctionPrice, logisticsCost, customsTax) {
  const baseForVat = auctionPrice + logisticsCost + customsTax;
  const vatRate = 0.20;
  return Math.round(baseForVat * vatRate);
}

function calculateCommission(auctionPrice) {
  const commission = auctionPrice * config.calculator.commissionRate;
  return Math.max(config.calculator.minCommissionUsd, Math.round(commission));
}

function calculateFinalPrice(currentBidUsd, engineCc, year, fuelType = 'Бензин') {
  const auctionPrice = Math.round(currentBidUsd || 0);
  const logisticsCost = config.calculator.logisticsCostUsd;
  const customsTax = calculateCustomsTax(year, engineCc, fuelType);
  const vat = calculateVat(auctionPrice, logisticsCost, customsTax);
  const serviceCommission = calculateCommission(auctionPrice);

  const totalPrice = auctionPrice + logisticsCost + customsTax + vat + serviceCommission;

  const vehicleAge = getVehicleAge(year);
  const bracket = getAgeBracket(vehicleAge);

  return {
    auctionPrice,
    deliveryAndLogistics: logisticsCost,
    customsTaxMoldova: customsTax,
    vatMoldova: vat,
    serviceCommission,
    totalPrice,
    finalMoldovaPriceUsd: totalPrice,
    breakdown: {
      vehicleAge,
      ageBracket: `до ${bracket.maxAge === Infinity ? '∞' : bracket.maxAge} лет`,
      ratePerCc: bracket.ratePerCc.toFixed(2),
      fuelMultiplier:
        fuelType === 'Электро' ? config.calculator.customs.electricRatePerCc :
        fuelType === 'Гибрид' ? config.calculator.customs.hybridMultiplier :
        fuelType === 'Дизель' ? 1.15 : 1.00,
    },
  };
}

function formatPriceUsd(price) {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(price || 0);
}

module.exports = {
  calculateFinalPrice,
  calculateCustomsTax,
  calculateVat,
  calculateCommission,
  getVehicleAge,
  formatPriceUsd,
};
