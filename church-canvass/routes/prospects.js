const express = require('express');
const pool = require('../db/pool');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Map page
router.get('/map', requireAuth, async (req, res) => {
  const { rows: lists } = await pool.query('SELECT id, name FROM lists ORDER BY position ASC');
  res.render('map', { lists, currentUser: req.session.user });
});

// JSON: all prospects with coordinates, for map pins
router.get('/api/prospects', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT c.id, c.name, c.phone, c.address, c.lat, c.lng, c.interest_level,
             c.notes, l.name AS list_name, u.name AS assigned_name
      FROM cards c
      LEFT JOIN lists l ON l.id = c.list_id
      LEFT JOIN users u ON u.id = c.assigned_to
      WHERE c.lat IS NOT NULL AND c.lng IS NOT NULL
      ORDER BY c.created_at DESC
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load prospects.' });
  }
});

// Create a prospect from the map popup form -> lands as a new card in the first list
router.post('/api/prospects', requireAuth, async (req, res) => {
  const { name, phone, email, address, lat, lng, notes, interest_level } = req.body;

  if (!name || !lat || !lng) {
    return res.status(400).json({ error: 'Name and map location are required.' });
  }

  try {
    const { rows: firstList } = await pool.query('SELECT id FROM lists ORDER BY position ASC LIMIT 1');
    const listId = firstList[0] ? firstList[0].id : null;

    const { rows: posRows } = await pool.query(
      'SELECT COALESCE(MAX(position), 0) + 1 AS next_position FROM cards WHERE list_id = $1',
      [listId]
    );

    const { rows } = await pool.query(
      `INSERT INTO cards
        (list_id, name, phone, email, address, lat, lng, notes, interest_level, assigned_to, created_by, position)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING *`,
      [
        listId, name.trim(), phone || null, email || null, address || null,
        lat, lng, notes || null, interest_level || 'warm',
        req.session.user.id, req.session.user.id, posRows[0].next_position
      ]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not save this prospect.' });
  }
});

// Best-effort reverse geocoding proxy (OpenStreetMap Nominatim) so the popup
// form can prefill an address from the clicked coordinates.
router.get('/api/reverse-geocode', requireAuth, async (req, res) => {
  const { lat, lng } = req.query;
  if (!lat || !lng) return res.status(400).json({ error: 'lat and lng required' });
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}`;
    const resp = await fetch(url, { headers: { 'User-Agent': 'church-canvass-prototype/1.0' } });
    const data = await resp.json();
    res.json({ address: data.display_name || '' });
  } catch (err) {
    res.json({ address: '' });
  }
});

module.exports = router;
