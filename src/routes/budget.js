const express = require('express');
const Budget = require('../models/Budget');
const Receipt = require('../models/Receipt');
const authenticate = require('../middleware/authenticate');

const router = express.Router();

// Get budget for specific month
router.get('/:month', authenticate, async (req, res) => {
  try {
    const { month } = req.params;

    let budget = await Budget.findOne({ userId: req.userId, month });

    if (!budget) {
      // Create default budget if not exists
      budget = new Budget({
        userId: req.userId,
        month,
        budget: 20000 // Will fetch from user settings
      });
      await budget.save();
    }

    res.json(budget);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update monthly budget
router.put('/:month', authenticate, async (req, res) => {
  try {
    const { month } = req.params;
    const { budget } = req.body;

    const monthBudget = await Budget.findOneAndUpdate(
      { userId: req.userId, month },
      { budget },
      { new: true, upsert: true }
    );

    res.json({ message: 'Budget updated', budget: monthBudget });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get budget summary for all months
router.get('/', authenticate, async (req, res) => {
  try {
    const budgets = await Budget.find({ userId: req.userId })
      .sort({ month: -1 });

    res.json(budgets);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get spending breakdown by category for a month
router.get('/:month/breakdown', authenticate, async (req, res) => {
  try {
    const { month } = req.params;
    const [year, monthNum] = month.split('-');

    const startDate = new Date(year, monthNum - 1, 1);
    const endDate = new Date(year, monthNum, 0);

    const receipts = await Receipt.find({
      userId: req.userId,
      date: { $gte: startDate, $lte: endDate }
    });

    const breakdown = {
      groceries: 0,
      dining: 0,
      transport: 0,
      entertainment: 0,
      utilities: 0,
      other: 0
    };

    receipts.forEach(receipt => {
      const category = receipt.category || 'other';
      breakdown[category] += receipt.total;
    });

    const budget = await Budget.findOne({ userId: req.userId, month });

    res.json({
      month,
      breakdown,
      total: receipts.reduce((sum, r) => sum + r.total, 0),
      budget: budget?.budget || 20000,
      itemCount: receipts.length
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
