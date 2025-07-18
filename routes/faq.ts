import express from 'express';
import FAQ from '../models/FAQ';

const router = express.Router();

// GET /faq - fetch all FAQs
router.get('/', async (req, res) => {
  try {
    const faqs = await FAQ.find();
    res.json(faqs);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch FAQs' });
  }
});

export default router;
