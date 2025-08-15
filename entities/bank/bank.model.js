import { Schema, model } from 'mongoose';
import { toTitleCase } from '../../utills/format-string.js';

// Bank Master Schema
const bankSchema = new Schema({
  name: { type: String, required: true, trim: true, set: toTitleCase },
  branch: { type: String, required: true },
  ifsc: { type: String, required: true, unique: true },
  place: { type: String, required: true },
  tenant: {
    type: Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    index: true,
  },
});

export default model('Bank', bankSchema);
