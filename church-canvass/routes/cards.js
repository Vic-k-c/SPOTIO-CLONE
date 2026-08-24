const express = require('express');
const pool = require('../db/pool');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

router.get('/board', requireAuth, async (req, res) => {
  const { rows: lists } = await pool.query('SELECT id, name, position FROM lists ORDER BY position ASC');
  const { rows: cards } = await pool.query(`
    SELECT c.*, u.name AS assigned_name
    FROM cards c
    LEFT JOIN users u ON u.id = c.assigned_to
    ORDER BY c.position ASC
  `);
  const { rows: users } = await pool.query('SELECT id, name FROM users ORDER BY name ASC');

  const board = lists.map((list) => ({
    ...list,
    cards: cards.filter((c) => c.list_id === list.id)
  }));

  res.render('board', { board, users, currentUser: req.session.user });
});

// Move a card to a new list / position (drag & drop)
router.patch('/api/cards/:id/move', requireAuth, async (req, res) => {
  const { list_id, position } = req.body;
  try {
    await pool.query(
      'UPDATE cards SET list_id = $1, position = $2, updated_at = NOW() WHERE id = $3',
      [list_id, position, req.params.id]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not move card.' });
  }
});

// Edit card details (notes, assignment, interest level, contact info)
router.patch('/api/cards/:id', requireAuth, async (req, res) => {
  const { name, phone, email, address, notes, interest_level, assigned_to } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE cards SET
        name = COALESCE($1, name),
        phone = $2,
        email = $3,
        address = $4,
        notes = $5,
        interest_level = COALESCE($6, interest_level),
        assigned_to = $7,
        updated_at = NOW()
       WHERE id = $8
       RETURNING *`,
      [name, phone || null, email || null, address || null, notes || null, interest_level, assigned_to || null, req.params.id]
    );
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not update card.' });
  }
});

router.delete('/api/cards/:id', requireAuth, requireRole('admin', 'leader'), async (req, res) => {
  try {
    await pool.query('DELETE FROM cards WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not delete card.' });
  }
});

module.exports = router;
