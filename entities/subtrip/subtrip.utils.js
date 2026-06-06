import dayjs from 'dayjs';

/**
 * Pure calculator function that calculates the gross freight amount of a subtrip.
 * Does not check database state or prioritize stored values.
 * 
 * @param {Object} params - Input parameters
 * @param {String} params.freightModel - Model used ('per_ton' | 'fixed' | 'per_km' | 'time_based' | 'hybrid')
 * @param {Number} params.rate - Rate value
 * @param {Number} params.baseFreight - Base freight for hybrid or fixed models
 * @param {Number} params.loadingWeight - Loaded weight (for per_ton)
 * @param {Date|String} params.startDate - Job start date/time
 * @param {Date|String} params.endDate - Job end date/time
 * @param {Number} params.startKm - KM reading at start
 * @param {Number} params.endKm - KM reading at end
 * @param {Number} params.baseKm - Base KM threshold for hybrid model
 * @param {Date|String} params.startTime - Alternative start time for time-based model
 * @param {Date|String} params.endTime - Alternative end time for time-based model
 * @returns {Number} Calculated gross freight amount
 */
export const calculateSubtripFreightAmount = ({
  freightModel,
  rate,
  baseFreight = 0,
  loadingWeight = 0,
  startDate,
  endDate,
  startKm = 0,
  endKm = 0,
  baseKm = 0,
  startTime,
  endTime,
}) => {
  const model = freightModel || 'per_ton';
  const r = Number(rate) || 0;
  const weight = Number(loadingWeight) || 0;

  if (model === 'per_ton') {
    return r * weight;
  }

  if (model === 'per_km') {
    const start = Number(startKm) || 0;
    const end = Number(endKm) || 0;
    return end > start ? (end - start) * r : 0;
  }

  if (model === 'hybrid') {
    const start = Number(startKm) || 0;
    const end = Number(endKm) || 0;
    const base = Number(baseKm) || 0;
    const totalKm = end > start ? end - start : 0;
    if (totalKm > base && r > 0) {
      const extraKm = totalKm - base;
      return Number(baseFreight) + (extraKm * r);
    }
    return Number(baseFreight);
  }

  if (model === 'time_based') {
    const startVal = startDate || startTime;
    const endVal = endDate || endTime;
    if (startVal && endVal) {
      const start = dayjs(startVal);
      const end = dayjs(endVal);
      const diffInHours = Math.ceil(end.diff(start, 'hour', true));
      if (diffInHours > 0) {
        return diffInHours * r;
      }
    }
    return 0;
  }

  if (model === 'fixed') {
    return Number(baseFreight);
  }

  return 0;
};
