import mongoose, { Schema } from 'mongoose';

const CounterSchema = new Schema(
  {
    key: { type: String, required: true, unique: true },
    seq: { type: Number, default: 0 },
  },
  { timestamps: true, collection: 'event_counters' }
);

export const CounterModel = mongoose.model('event_counter', CounterSchema);

export default CounterModel;

