import { Schema, model } from 'mongoose';

const partLocationSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    address: { type: String, required: true, trim: true },
    tenant: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true,
      index: true,
    },
  },
  { timestamps: true },
);

partLocationSchema.index({ tenant: 1, name: 1 }, { unique: true });

export default model('PartLocation', partLocationSchema);

