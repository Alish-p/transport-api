import Trip from '../trip/trip.model.js';
import Tenant from '../tenant/tenant.model.js';
import GpsSnapshot from './gpsSnapshot.model.js';
import '../vehicle/vehicle.model.js';
import { getAllFleetxVehicleData } from '../../helpers/fleetx.js';
import { TRIP_STATUS } from '../trip/trip.constants.js';
import { GPS_PROVIDERS } from '../gps/gps.constants.js';


/**
 * Parse a fuel string like "78 L" into a numeric value (78).
 * Returns null for unparseable or missing values.
 */
function parseFuel(fuelStr) {
  if (!fuelStr) return null;
  const num = parseFloat(String(fuelStr).replace(/[^\d.]/g, ''));
  return Number.isNaN(num) ? null : num;
}

export async function recordGpsSnapshots() {
  const startTime = Date.now();
  console.log('[Cron] GPS snapshot recording started');

  try {
    const tenants = await Tenant.find({
      'integrations.vehicleGPS.enabled': true,
    }).lean();

    if (!tenants.length) {
      console.log('[Cron] No tenants with GPS integration enabled');
      return;
    }

    let totalInserted = 0;

    for (const tenant of tenants) {
      const provider = tenant.integrations?.vehicleGPS?.provider?.toLowerCase();

      if (provider !== GPS_PROVIDERS.FLEETX) {
        console.log(`[Cron] Skipping tenant ${tenant.name} — unsupported GPS provider: ${provider}`);
        continue;
      }

      const openTrips = await Trip.find({
        tenant: tenant._id,
        tripStatus: TRIP_STATUS.OPEN,
      }).populate('vehicleId', 'vehicleNo isOwn');

      // Only track own vehicles that are on active trips
      const vehicleNos = [
        ...new Set(
          openTrips
            .filter((trip) => trip.vehicleId?.isOwn === true)
            .map((trip) => trip.vehicleId.vehicleNo)
            .filter(Boolean),
        ),
      ];

      if (!vehicleNos.length) {
        continue;
      }

      const gpsDataMap = await getAllFleetxVehicleData();
      const now = new Date();
      const snapshots = [];

      for (const vehicleNo of vehicleNos) {
        const gpsData = gpsDataMap[vehicleNo];
        if (!gpsData || gpsData.latitude == null || gpsData.longitude == null) {
          continue;
        }

        snapshots.push({
          vehicleNo,
          latitude: gpsData.latitude,
          longitude: gpsData.longitude,
          timestamp: now,
          speed: gpsData.speed || 0,
          address: gpsData.address || '',
          odometer: gpsData.totalOdometer || null,
          fuel: parseFuel(gpsData.fuel),
          currentStatus: gpsData.currentStatus || gpsData.status || '',
          tenant: tenant._id,
        });
      }

      if (snapshots.length) {
        await GpsSnapshot.insertMany(snapshots);
        totalInserted += snapshots.length;
      }

      console.log(`[Cron] Tenant ${tenant.name}: ${snapshots.length}/${vehicleNos.length} snapshots recorded`);
    }

    const elapsed = Date.now() - startTime;
    console.log(`[Cron] GPS snapshot recording complete — ${totalInserted} snapshots in ${elapsed}ms`);
  } catch (error) {
    console.error('[Cron] GPS snapshot recording failed', error);
  }
}


