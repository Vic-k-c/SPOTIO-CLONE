const express = require('express');
const pool = require('../db/pool');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  const { rows: totals } = await pool.query('SELECT COUNT(*)::int AS total FROM cards');
  const { rows: thisWeek } = await pool.query(
    "SELECT COUNT(*)::int AS count FROM cards WHERE created_at >= NOW() - INTERVAL '7 days'"
  );
  const { rows: byList } = await pool.query(`
    SELECT l.name, COUNT(c.id)::int AS count
    FROM lists l LEFT JOIN cards c ON c.list_id = l.id
    GROUP BY l.id, l.name, l.position
    ORDER BY l.position ASC
  `);
  const { rows: byInterest } = await pool.query(`
    SELECT interest_level, COUNT(*)::int AS count FROM cards GROUP BY interest_level
  `);
  const { rows: leaderboard } = await pool.query(`
    SELECT u.name, COUNT(c.id)::int AS count
    FROM users u JOIN cards c ON c.created_by = u.id
    GROUP BY u.id, u.name
    ORDER BY count DESC
    LIMIT 10
  `);
  const { rows: decisions } = await pool.query(`
    SELECT COUNT(*)::int AS count FROM cards c
    JOIN lists l ON l.id = c.list_id
    WHERE l.name = 'Decision Made'
  `);

  res.render('dashboard', {
    currentUser: req.session.user,
    total: totals[0].total,
    thisWeek: thisWeek[0].count,
    byList,
    byInterest,
    leaderboard,
    decisions: decisions[0].count
  });
});

module.exports = router;
