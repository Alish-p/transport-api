import SubtripEvent from '../entities/subtripEvent/subtripEvent.model.js';
import { SUBTRIP_EVENT_TYPES } from '../entities/subtripEvent/subtripEvent.constants.js';
import { fDate } from '../utils/time-utils.js';

// ----------------------------------------------------------------------
// Currency & number formatting (mirrors frontend fCurrency / fNumber)
// ----------------------------------------------------------------------

const fCurrency = (amount) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
  }).format(amount ?? 0);

const fNumber = (value) =>
  new Intl.NumberFormat('en-IN').format(value ?? 0);

// ----------------------------------------------------------------------
// Human-readable labels for known dot-notation field paths
// Covers top-level and nested subtrip fields.
// Unknown paths fall back to the raw dot-notation key.
// ----------------------------------------------------------------------

const FIELD_LABELS = {
  // Top-level
  subtripNo: 'Subtrip No',
  subtripStatus: 'Status',
  startDate: 'Start Date',
  endDate: 'End Date',
  shipmentNo: 'Shipment No',
  ewayBill: 'E-way Bill',
  ewayExpiryDate: 'E-way Expiry',
  podSignedAt: 'POD Signed At',
  routeId: 'Route',
  driver: 'Driver',
  vehicle: 'Vehicle',
  customer: 'Customer',
  trip: 'Trip',
  pump: 'Fuel Pump',
  subtripType: 'Subtrip Type',
  remarks: 'Remarks',

  // freightDetails
  'freightDetails.freightModel': 'Freight Model',
  'freightDetails.rate': 'Freight Rate',
  'freightDetails.freightAmount': 'Freight Amount',

  // commissionDetails
  'commissionDetails.commissionType': 'Commission Type',
  'commissionDetails.commissionRate': 'Commission Rate',
  'commissionDetails.commissionAmount': 'Commission Amount',

  // materialDetails
  'materialDetails.materialType': 'Material Type',
  'materialDetails.quantity': 'Quantity',
  'materialDetails.loadingWeight': 'Loading Weight',
  'materialDetails.rate': 'Material Rate',
};

const resolveLabel = (path) => FIELD_LABELS[path] ?? path;

// ----------------------------------------------------------------------
// Dot-notation diff formatter for UPDATED events
// changedFields is now flat: { [dotKey]: { from, to } } — no recursion needed.
// ----------------------------------------------------------------------

const flattenDiff = (changedFields) => {
  const lines = [];

  for (const [path, change] of Object.entries(changedFields)) {
    if (!change || typeof change !== 'object' || !('from' in change && 'to' in change)) continue;

    const label = resolveLabel(path);
    const from = change.from == null ? 'none' : String(change.from);
    const to = change.to == null ? 'none' : String(change.to);
    lines.push(`${label}: ${from} → ${to}`);
  }

  return lines;
};

// ----------------------------------------------------------------------
// Core compiler — pure function, no side effects
// ----------------------------------------------------------------------

const compileDisplayMessage = (eventType, details = {}, user = null) => {
  const name = user?.name;
  const prefix = name ? `**${name}**: ` : '';

  switch (eventType) {
    case SUBTRIP_EVENT_TYPES.CREATED:
      return `${prefix}${details.note || 'Loaded job created'}`;

    case SUBTRIP_EVENT_TYPES.RECEIVED: {
      const parts = ['Proof of Delivery received'];
      if (details.unloadingWeight > 0)   parts.push(`${fNumber(details.unloadingWeight)} ton`);
      if (details.endDate)               parts.push(`LR Date: ${fDate(details.endDate)}`);
      if (details.freightAmount != null) parts.push(`Freight: ${fCurrency(details.freightAmount)}`);
      if (details.commissionAmount > 0)  parts.push(`Commission: ${fCurrency(details.commissionAmount)}`);
      if (details.shortageWeight > 0)    parts.push(`Shortage: ${fNumber(details.shortageWeight)} ton (${fCurrency(details.shortageAmount)})`);
      return `${prefix}${parts.join(' · ')}`;
    }

    case SUBTRIP_EVENT_TYPES.STATUS_CHANGED:
      return `${prefix}${details.note || `Status changed to ${details.newStatus}`}`;

    case SUBTRIP_EVENT_TYPES.UPDATED: {
      const header = details.message || 'Subtrip details updated';
      const changed = details.changedFields || {};
      const diffLines = flattenDiff(changed);
      return diffLines.length
        ? `${prefix}${header}  \n${diffLines.join('\n')}`
        : `${prefix}${header}`;
    }

    case SUBTRIP_EVENT_TYPES.MATERIAL_ADDED: {
      const { materialType, quantity, loadingWeight, rate } = details;
      const parts = [];
      if (materialType) parts.push(materialType);
      if (typeof quantity !== 'undefined') parts.push(`qty ${fNumber(quantity)}`);
      if (typeof loadingWeight !== 'undefined') parts.push(`weight ${fNumber(loadingWeight)}`);
      if (typeof rate !== 'undefined') parts.push(`rate ${fCurrency(rate)}`);
      return `${prefix}Added material${parts.length ? ` — ${parts.join(', ')}` : ''}`;
    }

    case SUBTRIP_EVENT_TYPES.EXPENSE_ADDED: {
      const label = capitalize(details.expenseType || 'Expense');
      return `${prefix}${label} expense added for ${fCurrency(details.amount)}`;
    }

    case SUBTRIP_EVENT_TYPES.EXPENSE_DELETED: {
      const label = capitalize(details.expenseType || 'Expense');
      return `${prefix}${label} expense removed for ${fCurrency(details.amount)}`;
    }

    case SUBTRIP_EVENT_TYPES.ADVANCE_ADDED: {
      const label = capitalize(details.advanceType || 'Advance');
      return `${prefix}${label} advance added for ${fCurrency(details.amount)}`;
    }

    case SUBTRIP_EVENT_TYPES.ADVANCE_DELETED: {
      const label = capitalize(details.advanceType || 'Advance');
      return `${prefix}${label} advance removed for ${fCurrency(details.amount)}`;
    }

    case SUBTRIP_EVENT_TYPES.INVOICE_GENERATED:
      return `${prefix}Generated invoice [${details.invoiceNo}](/dashboard/invoice/${details.invoiceId}) for ${fCurrency(details.amount)}`;

    case SUBTRIP_EVENT_TYPES.INVOICE_DELETED:
      return `${prefix}Deleted invoice ${details.invoiceNo}`;

    case SUBTRIP_EVENT_TYPES.DRIVER_SALARY_GENERATED:
      return `${prefix}Processed driver salary [${details.paymentId}](/dashboard/driverSalary/${details.salaryId})`;

    case SUBTRIP_EVENT_TYPES.DRIVER_SALARY_CANCELLED:
      return `${prefix}Cancelled driver salary [${details.paymentId}](/dashboard/driverSalary/${details.salaryId})`;

    case SUBTRIP_EVENT_TYPES.TRANSPORTER_PAYMENT_GENERATED:
      return `${prefix}Processed transporter payment [${details.paymentId}](/dashboard/transporterPayment/${details.paymentReceiptId})`;

    case SUBTRIP_EVENT_TYPES.TRANSPORTER_PAYMENT_PAID:
      return `${prefix}Marked transporter payment [${details.paymentId}](/dashboard/transporterPayment/${details.paymentReceiptId}) as paid`;

    case SUBTRIP_EVENT_TYPES.TRANSPORTER_PAYMENT_CANCELLED:
      return `${prefix}Cancelled transporter payment [${details.paymentId}](/dashboard/transporterPayment/${details.paymentReceiptId})`;

    case SUBTRIP_EVENT_TYPES.ERROR_REPORTED:
      return `${prefix}${details.remarks || 'Error reported'}`;

    case SUBTRIP_EVENT_TYPES.ERROR_RESOLVED:
      return `${prefix}Resolved: ${details.remarks || 'Error resolved'}`;

    case SUBTRIP_EVENT_TYPES.EPOD_SUBMITTED:
      return `${prefix}ePOD submitted`;

    default:
      return `${prefix}${eventType}`;
  }
};

// ----------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------

const capitalize = (str) =>
  str ? str.charAt(0).toUpperCase() + str.slice(1).replace(/_/g, ' ') : '';

// ----------------------------------------------------------------------
// Public API
// ----------------------------------------------------------------------

const recordSubtripEvent = async (
  subtrip,
  eventType,
  details = {},
  user = null,
  tenant = null,
  session = null
) => {
  const subtripId =
    typeof subtrip === 'object' && subtrip !== null && subtrip._id
      ? subtrip._id
      : subtrip;

  const eventData = {
    subtripId,
    eventType,
    timestamp: new Date(),
    displayMessage: compileDisplayMessage(eventType, details, user),
    details,
    user: user
      ? {
        _id: user._id,
        name: user.name,
      }
      : null,
    tenant:
      tenant ||
      (typeof subtrip === 'object' && subtrip.tenant
        ? subtrip.tenant
        : undefined),
  };

  if (session) {
    await SubtripEvent.create([eventData], { session });
  } else {
    await SubtripEvent.create(eventData);
  }
};

export {
  recordSubtripEvent,
  compileDisplayMessage,
  SUBTRIP_EVENT_TYPES,
};
