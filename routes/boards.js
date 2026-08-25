const express = require('express');
const pool = require('../db/pool');
const { requireAuth, requireRole } = require('../middleware/auth');
const { requireBoardAccess, getBoardIdForList, getBoardPermission, atLeast } = require('../lib/access');
const { notify } = require('../lib/notify');
const { TEMPLATES, getTemplate } = require('../lib/templates');

const router = express.Router();

async function loadBoardsForUser(user) {
  const isAdmin = user.role === 'admin';
  const { rows } = await pool.query(
    isAdmin
      ? `SELECT b.*, u.name AS owner_name,
                (SELECT COUNT(*) FROM board_members m WHERE m.board_id = b.id) AS member_count,
                'owner' AS my_permission
         FROM boards b LEFT JOIN users u ON u.id = b.owner_id
         ORDER BY b.created_at DESC`
      : `SELECT b.*, u.name AS owner_name,
                (SELECT COUNT(*) FROM board_members m2 WHERE m2.board_id = b.id) AS member_count,
                bm.permission AS my_permission
         FROM boards b
         JOIN board_members bm ON bm.board_id = b.id AND bm.user_id = $1
         LEFT JOIN users u ON u.id = b.owner_id
         ORDER BY b.created_at DESC`,
    isAdmin ? [] : [user.id]
  );
  return rows;
}

// --- Board index: every board the user is a member of (admins see all) ---
router.get('/boards', requireAuth, async (req, res) => {
  const boards = await loadBoardsForUser(req.session.user);
  res.render('boards-index', { boards, templates: TEMPLATES, currentUser: req.session.user, error: null });
});

router.post('/boards', requireAuth, async (req, res) => {
  const { title, description, template } = req.body;
  if (!title || !title.trim()) {
    const boards = await loadBoardsForUser(req.session.user);
    return res.render('boards-index', { boards, templates: TEMPLATES, currentUser: req.session.user, error: 'Give the board a title.' });
  }

  const tpl = getTemplate(template);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: boardRows } = await client.query(
      'INSERT INTO boards (title, description, template, owner_id) VALUES ($1,$2,$3,$4) RETURNING id',
      [title.trim(), description || null, template || 'blank', req.session.user.id]
    );
    const boardId = boardRows[0].id;
    await client.query(
      "INSERT INTO board_members (board_id, user_id, permission) VALUES ($1,$2,'owner')",
      [boardId, req.session.user.id]
    );
    for (let i = 0; i < tpl.lists.length; i++) {
      await client.query('INSERT INTO lists (board_id, name, position) VALUES ($1,$2,$3)', [boardId, tpl.lists[i], i + 1]);
    }
    await client.query('COMMIT');
    res.redirect(`/boards/${boardId}`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).send('Could not create board.');
  } finally {
    client.release();
  }
});

// --- Board detail (the kanban view) ---
router.get('/boards/:id', requireAuth, requireBoardAccess('viewer'), async (req, res) => {
  const boardId = req.boardId;
  const { rows: boardRows } = await pool.query('SELECT * FROM boards WHERE id = $1', [boardId]);
  if (!boardRows[0]) return res.status(404).render('error', { title: 'Not found', message: 'That board does not exist.', currentUser: req.session.user });

  const { rows: lists } = await pool.query('SELECT id, name, position FROM lists WHERE board_id = $1 ORDER BY position ASC', [boardId]);
  const { rows: cards } = await pool.query(`
    SELECT c.*, u.name AS assigned_name,
           (SELECT COUNT(*) FROM card_attachments a WHERE a.card_id = c.id) AS attachment_count
    FROM cards c
    LEFT JOIN users u ON u.id = c.assigned_to
    JOIN lists l ON l.id = c.list_id
    WHERE l.board_id = $1
    ORDER BY c.position ASC
  `, [boardId]);
  const { rows: members } = await pool.query(`
    SELECT bm.user_id, bm.permission, u.name, u.email
    FROM board_members bm JOIN users u ON u.id = bm.user_id
    WHERE bm.board_id = $1 ORDER BY bm.added_at ASC
  `, [boardId]);
  const { rows: allUsers } = await pool.query('SELECT id, name, email FROM users ORDER BY name ASC');

  const board = lists.map((list) => ({ ...list, cards: cards.filter((c) => c.list_id === list.id) }));

  res.render('board', {
    boardMeta: boardRows[0],
    board,
    members,
    allUsers,
    myPermission: req.boardPermission,
    currentUser: req.session.user
  });
});

router.patch('/boards/:id', requireAuth, requireBoardAccess('owner'), async (req, res) => {
  const { title, description } = req.body;
  const { rows } = await pool.query(
    'UPDATE boards SET title = COALESCE($1, title), description = $2 WHERE id = $3 RETURNING *',
    [title && title.trim() ? title.trim() : null, description || null, req.boardId]
  );
  res.json(rows[0]);
});

router.delete('/boards/:id', requireAuth, requireBoardAccess('owner'), async (req, res) => {
  try {
    await pool.query('DELETE FROM cards WHERE list_id IN (SELECT id FROM lists WHERE board_id = $1)', [req.boardId]);
    await pool.query('DELETE FROM boards WHERE id = $1', [req.boardId]); // cascades lists, board_members
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not delete board.' });
  }
});

// --- Sharing / members ---
router.post('/boards/:id/members', requireAuth, requireBoardAccess('owner'), async (req, res) => {
  const { user_id, permission } = req.body;
  if (!user_id || !['owner', 'editor', 'viewer'].includes(permission)) {
    return res.status(400).json({ error: 'A user and a valid permission are required.' });
  }
  try {
    await pool.query(
      `INSERT INTO board_members (board_id, user_id, permission) VALUES ($1,$2,$3)
       ON CONFLICT (board_id, user_id) DO UPDATE SET permission = $3`,
      [req.boardId, user_id, permission]
    );
    const { rows: boardRows } = await pool.query('SELECT title FROM boards WHERE id = $1', [req.boardId]);
    await notify(user_id, `${req.session.user.name} added you to "${boardRows[0].title}" as ${permission}.`, `/boards/${req.boardId}`);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not add that member.' });
  }
});

router.patch('/boards/:id/members/:userId', requireAuth, requireBoardAccess('owner'), async (req, res) => {
  const { permission } = req.body;
  if (!['owner', 'editor', 'viewer'].includes(permission)) return res.status(400).json({ error: 'Invalid permission.' });
  await pool.query('UPDATE board_members SET permission = $1 WHERE board_id = $2 AND user_id = $3', [permission, req.boardId, req.params.userId]);
  res.json({ ok: true });
});

router.delete('/boards/:id/members/:userId', requireAuth, requireBoardAccess('owner'), async (req, res) => {
  const { rows: owners } = await pool.query(
    "SELECT COUNT(*)::int AS count FROM board_members WHERE board_id = $1 AND permission = 'owner'",
    [req.boardId]
  );
  const { rows: target } = await pool.query(
    'SELECT permission FROM board_members WHERE board_id = $1 AND user_id = $2',
    [req.boardId, req.params.userId]
  );
  if (target[0] && target[0].permission === 'owner' && owners[0].count <= 1) {
    return res.status(400).json({ error: "A board needs at least one owner." });
  }
  await pool.query('DELETE FROM board_members WHERE board_id = $1 AND user_id = $2', [req.boardId, req.params.userId]);
  res.json({ ok: true });
});

// --- Lists (scoped to a board) ---
router.post('/boards/:id/lists', requireAuth, requireBoardAccess('editor'), async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'List name is required.' });
  const { rows: posRows } = await pool.query('SELECT COALESCE(MAX(position),0)+1 AS next FROM lists WHERE board_id = $1', [req.boardId]);
  const { rows } = await pool.query(
    'INSERT INTO lists (board_id, name, position) VALUES ($1,$2,$3) RETURNING *',
    [req.boardId, name.trim(), posRows[0].next]
  );
  res.status(201).json(rows[0]);
});

router.patch('/lists/:id', requireAuth, async (req, res) => {
  try {
    const boardId = await getBoardIdForList(req.params.id);
    if (!boardId) return res.status(404).json({ error: 'List not found.' });
    const permission = await getBoardPermission(req.session.user.id, boardId, req.session.user.role);
    if (!permission || !atLeast(permission, 'editor')) return res.status(403).json({ error: 'No permission.' });

    const { name } = req.body;
    const { rows } = await pool.query('UPDATE lists SET name = COALESCE($1, name) WHERE id = $2 RETURNING *', [name, req.params.id]);
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not rename list.' });
  }
});

router.delete('/lists/:id', requireAuth, async (req, res) => {
  try {
    const boardId = await getBoardIdForList(req.params.id);
    if (!boardId) return res.status(404).json({ error: 'List not found.' });
    const permission = await getBoardPermission(req.session.user.id, boardId, req.session.user.role);
    if (!permission || !atLeast(permission, 'editor')) return res.status(403).json({ error: 'No permission.' });

    await pool.query('DELETE FROM cards WHERE list_id = $1', [req.params.id]);
    await pool.query('DELETE FROM lists WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not delete list.' });
  }
});

module.exports = router;
