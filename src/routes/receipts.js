const express = require('express');
const Receipt = require('../models/Receipt');
const Budget = require('../models/Budget');
const authenticate = require('../middleware/authenticate');

const router = express.Router();
let genAI = null;

try {
  const { GoogleGenerativeAI } = require('@google/generative-ai');
  genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
} catch (error) {
  console.warn('Google Gemini SDK not available. /api/receipts/analyze will be disabled.', error.message);
}

// Create receipt from image
router.post('/analyze', authenticate, async (req, res) => {
  try {
    const { imageData, storeName, date } = req.body;

    if (!imageData) {
      return res.status(400).json({ error: 'Image data required' });
    }

    if (!genAI) {
      return res.status(503).json({ error: 'Gemini AI SDK is not installed or configured.' });
    }

    // Call Gemini AI to analyze receipt
    const model = genAI.getGenerativeModel({ model: 'gemini-pro-vision' });

    // Convert base64 to buffer
    const imageBuffer = Buffer.from(imageData.replace(/^data:image\/\w+;base64,/, ''), 'base64');

    const prompt = `Analyze this receipt image and extract the following information in JSON format:
    {
      "storeName": "store name",
      "date": "date if visible",
      "total": numeric total amount,
      "items": [{"name": "item name", "quantity": 1, "price": 0, "category": "category"}],
      "taxAmount": tax amount if visible,
      "paymentMethod": "payment method if visible",
      "confidence": confidence percentage 0-100
    }`;

    const result = await model.generateContent([
      {
        inlineData: {
          data: imageData,
          mimeType: 'image/jpeg'
        }
      },
      prompt
    ]);

    const analysisText = result.response.text();
    const analysisData = JSON.parse(analysisText);

    // Create receipt
    const receipt = new Receipt({
      userId: req.userId,
      storeName: storeName || analysisData.storeName,
      date: date || analysisData.date,
      total: analysisData.total,
      items: analysisData.items,
      rawImageData: imageData,
      analysisData: {
        extractedText: analysisText,
        confidence: analysisData.confidence,
        taxAmount: analysisData.taxAmount,
        paymentMethod: analysisData.paymentMethod
      }
    });

    await receipt.save();

    // Update budget
    const currentDate = new Date();
    const monthKey = currentDate.toISOString().slice(0, 7);

    let budget = await Budget.findOne({ userId: req.userId, month: monthKey });
    if (!budget) {
      budget = new Budget({
        userId: req.userId,
        month: monthKey,
        budget: 20000 // Default, will be updated from user settings
      });
    }

    budget.spent += analysisData.total;
    await budget.save();

    res.status(201).json({
      message: 'Receipt analyzed and saved',
      receipt,
      analysisData
    });
  } catch (error) {
    console.error('Error analyzing receipt:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all receipts for user
router.get('/', authenticate, async (req, res) => {
  try {
    const { month, category, skip = 0, limit = 20 } = req.query;

    const query = { userId: req.userId };

    if (month) {
      const [year, monthNum] = month.split('-');
      const startDate = new Date(year, monthNum - 1, 1);
      const endDate = new Date(year, monthNum, 0);
      query.date = { $gte: startDate, $lte: endDate };
    }

    if (category) {
      query.category = category;
    }

    const receipts = await Receipt.find(query)
      .sort({ createdAt: -1 })
      .skip(parseInt(skip))
      .limit(parseInt(limit));

    const total = await Receipt.countDocuments(query);

    res.json({
      receipts,
      pagination: { total, skip: parseInt(skip), limit: parseInt(limit) }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get single receipt
router.get('/:id', authenticate, async (req, res) => {
  try {
    const receipt = await Receipt.findOne({
      _id: req.params.id,
      userId: req.userId
    });

    if (!receipt) {
      return res.status(404).json({ error: 'Receipt not found' });
    }

    res.json(receipt);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update receipt
router.put('/:id', authenticate, async (req, res) => {
  try {
    const { category, tags, notes } = req.body;

    const receipt = await Receipt.findOneAndUpdate(
      { _id: req.params.id, userId: req.userId },
      { category, tags, notes },
      { new: true }
    );

    if (!receipt) {
      return res.status(404).json({ error: 'Receipt not found' });
    }

    res.json({ message: 'Receipt updated', receipt });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete receipt
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const receipt = await Receipt.findOneAndDelete({
      _id: req.params.id,
      userId: req.userId
    });

    if (!receipt) {
      return res.status(404).json({ error: 'Receipt not found' });
    }

    res.json({ message: 'Receipt deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Share receipt
router.post('/:id/share', authenticate, async (req, res) => {
  try {
    const { sharedWith, visibility } = req.body;

    const receipt = await Receipt.findOneAndUpdate(
      { _id: req.params.id, userId: req.userId },
      { isShared: true, sharedWith, visibility },
      { new: true }
    );

    if (!receipt) {
      return res.status(404).json({ error: 'Receipt not found' });
    }

    res.json({ message: 'Receipt shared', receipt });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
