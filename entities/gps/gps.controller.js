import asyncHandler from 'express-async-handler';
import Tenant from '../tenant/tenant.model.js';
import { getFleetxVehicleData } from '../../helpers/fleetx.js';
import { GPS_PROVIDERS } from './gps.constants.js';

const getVehicleGpsData = asyncHandler(async (req, res) => {
  const { vehicleNo } = req.params;

  const tenant = await Tenant.findById(req.tenant);
  const integration = tenant?.integrations?.vehicleGPS;

  if (!integration?.enabled) {
    return res.status(400).json({ message: 'GPS not integrated' });
  }

  const provider = integration?.provider?.toLowerCase();

  if (!provider || !Object.values(GPS_PROVIDERS).includes(provider)) {
    return res.status(400).json({ message: 'Unsupported GPS provider' });
  }

  let data;

  switch (provider) {
    case GPS_PROVIDERS.FLEETX:
      data = await getFleetxVehicleData(vehicleNo);
      break;
    default:
      return res.status(400).json({ message: 'Unsupported GPS provider' });
  }

  if (!data) {
    return res.status(404).json({ message: 'Vehicle not found' });
  }

  res.status(200).json(data);
});

export { getVehicleGpsData };
