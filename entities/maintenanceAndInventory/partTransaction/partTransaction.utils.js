import PartStock from '../partStock/partStock.model.js';
import PartTransaction from './partTransaction.model.js';

/**
 * Records an inventory activity and updates the PartInventory.
 * This function should ideally be used within a transaction session if part of a larger operation.
 * 
 * @param {Object} params - The parameters for the activity.
 * @param {string} params.tenant - The tenant ID.
 * @param {string} params.partId - The part ID.
 * @param {string} params.locationId - The location ID.
 * @param {string} params.type - The type of activity (from INVENTORY_ACTIVITY_TYPES).
 * @param {string} params.direction - 'IN' or 'OUT'.
 * @param {number} params.quantityChange - The amount to change (positive for IN, negative for OUT usually, but handled by logic).
 * @param {string} params.performedBy - The user ID performing the action.
 * @param {string} params.sourceDocumentType - The type of source document (from SOURCE_DOCUMENT_TYPES).
 * @param {string} [params.sourceDocumentId] - The ID of the source document.
 * @param {string} [params.sourceDocumentLineId] - The ID of the specific line item in the source document.
 * @param {string} [params.reason] - Optional reason for the change.
 * @param {Object} [params.meta] - Optional metadata.
 * @param {Object} [session] - Mongoose transaction session.
 */
export const recordInventoryActivity = async (
    {
        tenant,
        partId,
        locationId,
        type,
        direction,
        quantityChange,
        performedBy,
        sourceDocumentType,
        sourceDocumentId,
        sourceDocumentLineId,
        reason,
        meta,
    },
    session = null
) => {
    // 1. Find or create the PartStock record
    let partStock = await PartStock.findOne({
        tenant,
        part: partId,
        inventoryLocation: locationId,
    }).session(session);

    if (!partStock) {
        partStock = new PartStock({
            tenant,
            part: partId,
            inventoryLocation: locationId,
            quantity: 0,
        });
    }

    const quantityBefore = partStock.quantity;
    const quantityAfter = quantityBefore + quantityChange;

    if (quantityAfter < 0) {
        throw new Error(`Insufficient stock. Current: ${quantityBefore}, Requested change: ${quantityChange}`);
    }

    // 2. Update PartStock
    partStock.quantity = quantityAfter;
    await partStock.save({ session });

    // 3. Create PartTransaction
    const activity = new PartTransaction({
        tenant,
        part: partId,
        inventoryLocation: locationId,
        partStock: partStock._id,
        type,
        direction,
        quantityBefore,
        quantityChange,
        quantityAfter,
        performedBy,
        reason,
        sourceDocumentType,
        sourceDocumentId,
        sourceDocumentLineId,
        meta,
    });

    await activity.save({ session });

    return { partStock, activity };
};
