const express = require('express');
const router = express.Router();
const OpenAI = require('openai');
const db = require('../db');
const authMiddleware = require('../middleware/auth');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// SEND MESSAGE
router.post('/', authMiddleware, async (req, res) => {
  const { message } = req.body;
  const userId = req.user.id;

  if (!message) return res.status(400).json({ error: 'Message is required' });

  try {
    // Save user message to DB
    await db.query(
      'INSERT INTO messages (user_id, role, content) VALUES (?, ?, ?)',
      [userId, 'user', message]
    );

    // Fetch chat history for context
    const [history] = await db.query(
      'SELECT role, content FROM messages WHERE user_id = ? ORDER BY created_at ASC LIMIT 20',
      [userId]
    );

    // Call OpenAI
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        ...history.map(m => ({ role: m.role, content: m.content })),
      ],
    });

    const reply = completion.choices[0].message.content;

    // Save assistant reply to DB
    await db.query(
      'INSERT INTO messages (user_id, role, content) VALUES (?, ?, ?)',
      [userId, 'assistant', reply]
    );

    res.json({ reply });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET CHAT HISTORY
router.get('/history', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  try {
    const [messages] = await db.query(
      'SELECT role, content, created_at FROM messages WHERE user_id = ? ORDER BY created_at ASC',
      [userId]
    );
    res.json({ messages });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;