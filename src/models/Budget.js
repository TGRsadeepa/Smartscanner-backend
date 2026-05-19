const mongoose = require('mongoose');

const budgetSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  month: {
    type: String, // Format: YYYY-MM
    required: true
  },
  budget: {
    type: Number,
    required: true
  },
  spent: {
    type: Number,
    default: 0
  },
  remaining: {
    type: Number,
    default: function() {
      return this.budget - this.spent;
    }
  },
  categoryBreakdown: {
    groceries: { type: Number, default: 0 },
    dining: { type: Number, default: 0 },
    transport: { type: Number, default: 0 },
    entertainment: { type: Number, default: 0 },
    utilities: { type: Number, default: 0 },
    other: { type: Number, default: 0 }
  },
  alerts: {
    budgetExceeded: { type: Boolean, default: false },
    at80Percent: { type: Boolean, default: false },
    at50Percent: { type: Boolean, default: false }
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

// Index for unique user-month combination
budgetSchema.index({ userId: 1, month: 1 }, { unique: true });

module.exports = mongoose.model('Budget', budgetSchema);
