import { Schema, model } from 'mongoose';

const partSchema = new Schema(
  {
    partNumber: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    category: { type: String, trim: true },
    photo: { type: String, trim: true },
    manufacturer: { type: String, trim: true },
    unitCost: { type: Number, required: true, min: 0 },
    averageUnitCost: { type: Number, default: 0, min: 0 },
    measurementUnit: { type: String, required: true, trim: true },
    tenant: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true,
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

partSchema.index({ tenant: 1, partNumber: 1 }, { unique: true });

export default model('Part', partSchema);

