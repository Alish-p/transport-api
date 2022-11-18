const { Schema, model } = require('mongoose');

const CounterSchema = Schema({
  _id: { type: String, required: true },
  seq: { type: Number, default: 2 },
});

module.exports = model('counter', CounterSchema);
