const express = require('express');
const PDFDocument = require('pdfkit');
const pool = require('../db/pool');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

async function getExportRows() {
  const { rows } = await pool.query(`
    SELECT c.name, c.phone, c.email, c.address, c.interest_level, c.notes,
           l.name AS list_name, u.name AS assigned_name, c.created_at
    FROM cards c
    LEFT JOIN lists l ON l.id = c.list_id
    LEFT JOIN users u ON u.id = c.assigned_to
    ORDER BY l.position ASC, c.created_at ASC
  `);
  return rows;
}

router.get('/export/pdf', requireAuth, async (req, res) => {
  try {
    const rows = await getExportRows();
    const doc = new PDFDocument({ margin: 40, size: 'A4' });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="soul-winning-report.pdf"');
    doc.pipe(res);

    doc.fontSize(20).text('Soul Winning Prospect Report', { align: 'left' });
    doc.fontSize(10).fillColor('#666').text(`Generated ${new Date().toLocaleString()}`);
    doc.moveDown(1);
    doc.fillColor('#000');

    let currentList = null;
    rows.forEach((row) => {
      if (row.list_name !== currentList) {
        currentList = row.list_name;
        doc.moveDown(0.5);
        doc.fontSize(14).fillColor('#1B2A41').text(currentList || 'Unassigned', { underline: true });
        doc.fillColor('#000');
      }
      doc.fontSize(11).text(`${row.name}  (${row.interest_level})`, { continued: false });
      const details = [
        row.phone ? `Phone: ${row.phone}` : null,
        row.email ? `Email: ${row.email}` : null,
        row.address ? `Address: ${row.address}` : null,
        row.assigned_name ? `Assigned: ${row.assigned_name}` : null
      ].filter(Boolean).join('   |   ');
      if (details) doc.fontSize(9).fillColor('#555').text(details);
      if (row.notes) doc.fontSize(9).fillColor('#555').text(`Notes: ${row.notes}`);
      doc.fillColor('#000');
      doc.moveDown(0.4);
    });

    if (rows.length === 0) {
      doc.fontSize(11).text('No prospects recorded yet.');
    }

    doc.end();
  } catch (err) {
    console.error(err);
    res.status(500).send('Could not generate PDF.');
  }
});

router.get('/export/csv', requireAuth, async (req, res) => {
  try {
    const rows = await getExportRows();
    const header = ['Name', 'Phone', 'Email', 'Address', 'Interest', 'Stage', 'Assigned To', 'Notes', 'Created'];
    const escape = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
    const lines = [header.map(escape).join(',')];
    rows.forEach((r) => {
      lines.push([
        r.name, r.phone, r.email, r.address, r.interest_level, r.list_name,
        r.assigned_name, r.notes, r.created_at ? r.created_at.toISOString() : ''
      ].map(escape).join(','));
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="soul-winning-prospects.csv"');
    res.send(lines.join('\n'));
  } catch (err) {
    console.error(err);
    res.status(500).send('Could not generate CSV.');
  }
});

module.exports = router;
