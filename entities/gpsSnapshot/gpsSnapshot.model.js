import { Schema, model } from 'mongoose';

const gpsSnapshotSchema = new Schema({
  vehicleNo: { type: String, required: true, index: true },
  latitude: { type: Number, required: true },
  longitude: { type: Number, required: true },
  timestamp: { type: Date, required: true },
  speed: { type: Number, default: 0 },
  address: { type: String },
  odometer: { type: Number },
  fuel: { type: Number },
  currentStatus: { type: String },
  tenant: {
    type: Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    index: true,
  },
  createdAt: { type: Date, default: Date.now, expires: 5184000 }, // 60-day TTL
});

gpsSnapshotSchema.index({ vehicleNo: 1, timestamp: 1 });
gpsSnapshotSchema.index({ tenant: 1, vehicleNo: 1, timestamp: 1 });

export default model('GpsSnapshot', gpsSnapshotSchema);
