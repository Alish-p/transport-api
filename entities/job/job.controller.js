import mongoose from 'mongoose';
import asyncHandler from 'express-async-handler';
import Trip from '../trip/trip.model.js';
import Subtrip from '../subtrip/subtrip.model.js';
import Vehicle from '../vehicle/vehicle.model.js';
import Expense from '../expense/expense.model.js';
import { TRIP_STATUS } from '../trip/trip.constants.js';
import { SUBTRIP_STATUS } from '../subtrip/subtrip.constants.js';
import { recordSubtripEvent } from '../../helpers/subtrip-event-helper.js';
import { SUBTRIP_EVENT_TYPES } from '../subtripEvent/subtripEvent.constants.js';
import { EXPENSE_CATEGORIES } from '../expense/expense.constants.js';


// New controller: createJob
// Handles revised flow:
// - Trip is optional and only for own vehicles
// - startKm is moved to Trip level and only captured for "Create New & Close Previous"
// - New Trip's startKm equals previous Trip's endKm (value provided during closing)
// - Market vehicles are always treated as loaded (no empty jobs, no trips)
// - Validations per scenario as described in the request
const createJob = asyncHandler(async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const now = new Date();
    const {
      vehicleId,
      driverId,
      isEmpty: isEmptyInput,
      // Trip handling inputs (own vehicles only)
      tripDecision: inputTripDecision, // 'attach' | 'new'
      tripId: providedTripId,
      startKm: providedStartKm, // Trip-level start km when creating new & closing previous
      fromDate: fromDateRaw,
      startDate: startDateRaw,
      remarks,

      // Points/party
      loadingPoint: loadingPointInput,
      unloadingPoint: unloadingPointInput,
      customerId,
      consignee,

      // Material
      loadingWeight,
      rate,
      invoiceNo,
      ewayExpiryDate: ewayExpiryDateRaw,
      materialType,
      ewayBill,
      quantity,
      grade,
      shipmentNo,
      orderNo,
      referenceSubtripNo,
      diNumber,

      // Optional driver advance inputs
      driverAdvance,
      initialAdvanceDiesel,
      initialAdvanceDieselUnit,
      driverAdvanceGivenBy,
      pumpCd,

      // Misc
      remarks: subtripRemarks,
    } = req.body;

    // Normalize dates
    const startDate = startDateRaw ? new Date(startDateRaw) : null;
    const fromDate = fromDateRaw ? new Date(fromDateRaw) : startDate;
    const ewayExpiryDate = ewayExpiryDateRaw ? new Date(ewayExpiryDateRaw) : null;

    // Basic presence checks
    if (!vehicleId) {
      const err = new Error('vehicleId is required');
      err.status = 400;
      throw err;
    }
    if (!driverId) {
      const err = new Error('driverId is required');
      err.status = 400;
      throw err;
    }
    if (!startDate) {
      const err = new Error('startDate is required');
      err.status = 400;
      throw err;
    }

    // Date validations
    if (startDate > now) {
      const err = new Error('startDate cannot be in the future');
      err.status = 400;
      throw err;
    }

    // Fetch vehicle
    const vehicle = await Vehicle.findOne({ _id: vehicleId, tenant: req.tenant }).session(session);
    if (!vehicle) {
      const err = new Error('Vehicle not found');
      err.status = 404;
      throw err;
    }

    // Determine scenario: market vs own
    const isOwnVehicle = !!vehicle.isOwn;

    // Market vehicles cannot be empty and do not use trips
    if (!isOwnVehicle) {
      if (isEmptyInput) {
        const err = new Error('Market vehicle jobs cannot be empty');
        err.status = 400;
        throw err;
      }

      // Block trip-specific inputs for market vehicles to avoid confusion
      if (inputTripDecision || providedTripId || typeof providedStartKm !== 'undefined') {
        const err = new Error('Trips are not used for market vehicles');
        err.status = 400;
        throw err;
      }
    }

    // Validate loaded/market required fields
    const isLoaded = !isEmptyInput || !isOwnVehicle; // market treated as loaded

    // Require loading/unloading points explicitly
    if (!loadingPointInput || !unloadingPointInput) {
      const err = new Error('loadingPoint and unloadingPoint are required');
      err.status = 400;
      throw err;
    }
    const loadingPoint = loadingPointInput;
    const unloadingPoint = unloadingPointInput;

    if (isLoaded) {
      if (!customerId) {
        const err = new Error('customerId is required for loaded/market job');
        err.status = 400;
        throw err;
      }
      if (!consignee || !consignee.trim()) {
        const err = new Error('consignee is required for loaded/market job');
        err.status = 400;
        throw err;
      }
      if (
        [loadingWeight, rate, invoiceNo, ewayExpiryDate, materialType].some(
          (v) => v === undefined || v === null || v === ''
        )
      ) {
        const err = new Error(
          'loadingWeight, rate, invoiceNo, ewayExpiryDate and materialType are required for loaded/market job'
        );
        err.status = 400;
        throw err;
      }

      // ewayExpiryDate must be today or later
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      if (ewayExpiryDate < startOfToday) {
        const err = new Error('ewayExpiryDate must be today or later');
        err.status = 400;
        throw err;
      }
    }

    // Trip handling for own vehicles only
    let tripToUse = null;
    let autoClosedEmptySubtripIds = [];
    let tripDecision = inputTripDecision;

    if (isOwnVehicle) {
      // Find active open trips for this vehicle
      const openTrips = await Trip.find({
        vehicleId,
        tenant: req.tenant,
        tripStatus: TRIP_STATUS.OPEN,
      })
        .session(session)
        .exec();

      if (openTrips.length > 1) {
        const err = new Error('Multiple active trips exist for this vehicle. Resolve before continuing.');
        err.status = 409;
        throw err;
      }
      const activeTrip = openTrips[0] || null;

      // Determine default decision when none is provided
      if (!tripDecision) {
        if (activeTrip) {
          const err = new Error('tripDecision is required when an active trip exists (attach or new)');
          err.status = 400;
          throw err;
        } else {
          tripDecision = 'new';
        }
      }

      if (tripDecision === 'attach') {
        if (!activeTrip) {
          const err = new Error('No active trip to attach for this vehicle');
          err.status = 400;
          throw err;
        }
        if (providedTripId && String(providedTripId) !== String(activeTrip._id)) {
          const err = new Error('Provided tripId does not match active trip');
          err.status = 400;
          throw err;
        }
        tripToUse = activeTrip;
      } else if (tripDecision === 'new') {
        // If there is an active trip, we must close it and require startKm input 
        if (activeTrip) {
          if (typeof providedStartKm !== 'number') {
            const err = new Error('startKm is required when creating new trip and closing previous');
            err.status = 400;
            throw err;
          }

          // Auto-close any empty subtrips still open on the active trip
          const empties = await Subtrip.find({
            tenant: req.tenant,
            tripId: activeTrip._id,
            isEmpty: true,
            subtripStatus: { $ne: SUBTRIP_STATUS.BILLED },
          })
            .session(session)
            .select('_id');

          if (empties.length) {
            await Subtrip.updateMany(
              { tenant: req.tenant, _id: { $in: empties.map((s) => s._id) } },
              { subtripStatus: SUBTRIP_STATUS.BILLED, endDate: new Date(fromDate) },
              { session }
            );
            autoClosedEmptySubtripIds = empties.map((s) => s._id.toString());
          }

          // Close previous trip with endKm = providedStartKm and toDate = fromDate
          activeTrip.tripStatus = TRIP_STATUS.CLOSED;
          activeTrip.toDate = new Date(fromDate);
          activeTrip.endKm = providedStartKm;
          await activeTrip.save({ session });

          // Create new trip; new trip's startKm equals previous trip's endKm
          const newTrip = new Trip({
            driverId,
            vehicleId,
            tripStatus: TRIP_STATUS.OPEN,
            fromDate,
            startKm: providedStartKm,
            remarks,
            tenant: req.tenant,
          });
          tripToUse = await newTrip.save({ session });
        } else {
          // No active trip: create fresh one; Start km is optional (default 0)
          const newTrip = new Trip({
            driverId,
            vehicleId,
            tripStatus: TRIP_STATUS.OPEN,
            fromDate,
            startKm: typeof providedStartKm === 'number' ? providedStartKm : 0,
            remarks,
            tenant: req.tenant,
          });
          tripToUse = await newTrip.save({ session });
        }
      } else {
        const err = new Error("tripDecision must be 'attach' or 'new'");
        err.status = 400;
        throw err;
      }
    }

    // Build subtrip payload (no startKm/endKm on subtrip now)
    const subtripFields = {
      tenant: req.tenant,
      driverId,
      vehicleId,
      subtripStatus: SUBTRIP_STATUS.LOADED,
      isEmpty: !!(isOwnVehicle ? isEmptyInput : false),
      startDate,
      loadingPoint,
      unloadingPoint,
    };

    if (tripToUse?._id) {
      subtripFields.tripId = tripToUse._id;
    }

    if (isLoaded) {
      Object.assign(subtripFields, {
        customerId,
        consignee,
        loadingWeight,
        rate,
        invoiceNo,
        ewayExpiryDate,
        materialType,
        ewayBill,
        quantity,
        grade,
        shipmentNo,
        orderNo,
        referenceSubtripNo,
        diNumber,
        initialAdvanceDiesel,
        initialAdvanceDieselUnit,
        driverAdvanceGivenBy,
      });
      if (pumpCd) subtripFields.intentFuelPump = pumpCd;
    } else {
      // Empty job: ensure no loaded-only fields mistakenly sent
      if (
        customerId ||
        consignee ||
        loadingWeight ||
        rate ||
        invoiceNo ||
        ewayExpiryDate ||
        materialType
      ) {
        const err = new Error('Empty job must not include customer/consignee/material fields');
        err.status = 400;
        throw err;
      }
    }

    if (subtripRemarks) {
      subtripFields.remarks = subtripRemarks;
    }

    const subtrip = new Subtrip(subtripFields);
    const newSubtrip = await subtrip.save({ session });

    // Attach subtrip to trip if present
    if (tripToUse) {
      tripToUse.subtrips.push(newSubtrip._id);
      await tripToUse.save({ session });
    }

    // Only add expenses if explicitly received from UI req
    // Normalize inputs
    const normGivenBy = (driverAdvanceGivenBy || '').toString().toLowerCase();
    const isGivenByPump = normGivenBy.includes('pump'); // handles 'pump' or 'fuel pump'
    const normDieselUnit = (initialAdvanceDieselUnit || '').toString().toLowerCase();

    // Populate fuel intent fields on subtrip
    // - Store initialTripAdvance with driverAdvance value for reference
    const needsSubtripUpdate =
      driverAdvance !== undefined ||
      initialAdvanceDiesel !== undefined ||
      initialAdvanceDieselUnit !== undefined ||
      pumpCd ||
      driverAdvanceGivenBy;
    if (needsSubtripUpdate) {
      const patch = {};
      if (driverAdvance !== undefined) patch.initialTripAdvance = driverAdvance;
      if (initialAdvanceDiesel !== undefined) patch.initialAdvanceDiesel = initialAdvanceDiesel;
      if (initialAdvanceDieselUnit !== undefined) patch.initialAdvanceDieselUnit = initialAdvanceDieselUnit;
      if (driverAdvanceGivenBy)
        patch.driverAdvanceGivenBy = isGivenByPump ? 'Fuel Pump' : 'Self';
      if (pumpCd) patch.intentFuelPump = pumpCd;
      if (Object.keys(patch).length) {
        await Subtrip.updateOne({ _id: newSubtrip._id, tenant: req.tenant }, { $set: patch }, { session });
      }
    }

    const expensesToInsert = [];

    // Driver Advance: add if > 0
    if (typeof driverAdvance === 'number' && driverAdvance > 0) {
      expensesToInsert.push({
        tenant: req.tenant,
        tripId: newSubtrip.tripId,
        subtripId: newSubtrip._id,
        vehicleId,
        amount: driverAdvance,
        expenseType: 'Trip Advance',
        expenseCategory: EXPENSE_CATEGORIES.SUBTRIP,
        remarks: 'Driver advance from UI',
        paidThrough: isGivenByPump ? 'Pump' : 'Cash',
        pumpCd: isGivenByPump ? pumpCd || null : null,
      });
    }

    // Initial Advance Diesel: if unit is amount, add expense with pumpCd; if litre, don't add
    if (
      typeof initialAdvanceDiesel === 'number' &&
      initialAdvanceDiesel > 0 &&
      normDieselUnit === 'amount'
    ) {
      expensesToInsert.push({
        tenant: req.tenant,
        tripId: newSubtrip.tripId,
        subtripId: newSubtrip._id,
        vehicleId,
        amount: initialAdvanceDiesel,
        expenseType: 'Diesel',
        expenseCategory: EXPENSE_CATEGORIES.SUBTRIP,
        remarks: 'Initial advance diesel (amount) from UI',
        paidThrough: 'Pump',
        pumpCd: pumpCd || null,
      });
    }

    if (expensesToInsert.length) {
      const createdExpenses = await Expense.insertMany(expensesToInsert, { session });
      if (!newSubtrip.expenses) newSubtrip.expenses = [];
      newSubtrip.expenses.push(...createdExpenses.map((e) => e._id));
      await newSubtrip.save({ session });
    }

    await session.commitTransaction();
    session.endSession();

    // Events after commit
    await recordSubtripEvent(
      newSubtrip._id,
      SUBTRIP_EVENT_TYPES.CREATED,
      { note: isLoaded ? 'Loaded job created' : 'Empty job created' },
      req.user,
      req.tenant
    );

    if (autoClosedEmptySubtripIds.length) {
      await Promise.all(
        autoClosedEmptySubtripIds.map((sid) =>
          recordSubtripEvent(
            sid,
            SUBTRIP_EVENT_TYPES.STATUS_CHANGED,
            { note: 'Empty subtrip auto-closed when starting new trip', newStatus: SUBTRIP_STATUS.BILLED },
            req.user,
            req.tenant
          )
        )
      );
    }

    return res.status(201).json(newSubtrip);
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    const status = error.status || 500;
    return res.status(status).json({ message: error.message || 'Internal Server Error' });
  }
});

export { createJob };
