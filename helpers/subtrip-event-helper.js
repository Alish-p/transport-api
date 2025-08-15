import { SUBTRIP_EVENT_TYPES } from '../constants/event-types.js';
import SubtripEvent from '../model/SubtripEvent.js';

const recordSubtripEvent = async (
  subtrip,
  eventType,
  details = {},
  user = null,
  tenant = null,
  session = null
) => {
  const subtripId =
    typeof subtrip === "object" && subtrip !== null && subtrip._id
      ? subtrip._id
      : subtrip;

  const eventData = {
    subtripId,
    eventType,
    timestamp: new Date(),
    details,
    user: user
      ? {
          _id: user._id,
          name: user.name,
        }
      : null,
    tenant:
      tenant ||
      (typeof subtrip === "object" && subtrip.tenant
        ? subtrip.tenant
        : undefined),
  };

  if (session) {
    await SubtripEvent.create(eventData, { session });
  } else {
    await SubtripEvent.create(eventData);
  }
};

// Helper function to generate event message based on event type and details
const generateEventMessage = (event) => {
  const { eventType, details, user } = event;
  const userInfo = user?.name ? `by ${user.name}` : "";

  switch (eventType) {
    case SUBTRIP_EVENT_TYPES.CREATED:
      return `Subtrip created ${userInfo}`;

    case SUBTRIP_EVENT_TYPES.MATERIAL_ADDED:
      return `Material details added: ${details.materialType} - ${details.quantity} ${userInfo}`;

    case SUBTRIP_EVENT_TYPES.EXPENSE_ADDED:
      return `Expense added: ${details.expenseType} - ₹${details.amount} ${userInfo}`;

    case SUBTRIP_EVENT_TYPES.EXPENSE_DELETED:
      return `Expense deleted: ${details.expenseType} - ₹${details.amount} ${userInfo}`;

    case SUBTRIP_EVENT_TYPES.RECEIVED:
      return `LR received with weight ${details.unloadingWeight}kg ${userInfo}`;

    case SUBTRIP_EVENT_TYPES.ERROR_REPORTED:
      return `Error reported: ${details.remarks || "No remarks"} ${userInfo}`;

    case SUBTRIP_EVENT_TYPES.ERROR_RESOLVED:
      return `Error resolved ${userInfo}`;

    case SUBTRIP_EVENT_TYPES.CLOSED:
      return `Subtrip closed ${userInfo}`;

    case SUBTRIP_EVENT_TYPES.INVOICE_GENERATED:
      return `Invoice generated: ${details.invoiceNo} ${userInfo}`;

    case SUBTRIP_EVENT_TYPES.INVOICE_DELETED:
      return `Invoice deleted: ${details.invoiceNo} ${userInfo}`;

    case SUBTRIP_EVENT_TYPES.DRIVER_SALARY_GENERATED:
      return `Driver salary processed ${userInfo}`;

    case SUBTRIP_EVENT_TYPES.TRANSPORTER_PAYMENT_GENERATED:
      return `Transporter payment processed ${userInfo}`;

    case SUBTRIP_EVENT_TYPES.STATUS_CHANGED:
      return `Status changed to ${details.newStatus} ${userInfo}`;

    case SUBTRIP_EVENT_TYPES.UPDATED:
      const changedFieldsList = Object.keys(details.changedFields || {}).join(
        ", "
      );
      return `Updated subtrip fields: ${changedFieldsList} ${userInfo}`;

    default:
      return `${eventType} ${userInfo}`;
  }
};

export { recordSubtripEvent,
  generateEventMessage,
  SUBTRIP_EVENT_TYPES, };
