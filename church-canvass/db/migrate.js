require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('./pool');

const DEFAULT_LISTS = [
  'New Prospect',
  'Contacted',
  'Follow-Up',
  'Bible Study',
  'Decision Made',
  'Not Interested'
];

async function migrate() {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  console.log('Running schema...');
  await pool.query(schema);

  const { rows } = await pool.query('SELECT COUNT(*)::int AS count FROM lists');
  if (rows[0].count === 0) {
    console.log('Seeding default board lists...');
    for (let i = 0; i < DEFAULT_LISTS.length; i++) {
      await pool.query('INSERT INTO lists (name, position) VALUES ($1, $2)', [DEFAULT_LISTS[i], i + 1]);
    }
  } else {
    console.log('Lists already seeded, skipping.');
  }

  console.log('Migration complete.');
  await pool.end();
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
