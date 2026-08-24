(function () {
  const DEFAULT_CENTER = [39.8283, -98.5795]; // fallback: center of the US
  const map = L.map('map', { zoomControl: true }).setView(DEFAULT_CENTER, 5);

  const streetLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
  });

  // Esri World Imagery — free satellite/aerial tiles, no API key required.
  const satelliteLayer = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    {
      maxZoom: 19,
      attribution: 'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics'
    }
  );

  streetLayer.addTo(map);
  L.control.layers(
    { 'Street': streetLayer, 'Satellite': satelliteLayer },
    {},
    { position: 'topright', collapsed: false }
  ).addTo(map);

  const hint = document.getElementById('mapHint');
  let clickMarker = null;
  const prospectMarkers = L.layerGroup().addTo(map);

  // --- Snap to the user's current location ---
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        map.setView([latitude, longitude], 17);
        L.circleMarker([latitude, longitude], {
          radius: 8, color: '#1B2A41', fillColor: '#5D8A66', fillOpacity: 0.9, weight: 2
        }).addTo(map).bindTooltip('You are here');
        hint.textContent = 'Click any house on the map to log a prospect there.';
      },
      () => {
        hint.textContent = "Couldn't find your location — search or scroll the map, then click a house to log a prospect.";
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  } else {
    hint.textContent = 'Click any house on the map to log a prospect there.';
  }

  function interestColor(level) {
    return (window.INTEREST_COLORS && window.INTEREST_COLORS[level]) || '#E3A93B';
  }

  function popupFormHtml(lat, lng) {
    return `
      <form class="popup-form" id="prospectForm">
        <strong>New prospect</strong>
        <label>Name *</label>
        <input type="text" name="name" required>
        <label>Phone</label>
        <input type="tel" name="phone">
        <label>Address</label>
        <input type="text" name="address" id="addressField" placeholder="Looking it up...">
        <label>Interest level</label>
        <select name="interest_level">
          <option value="warm" selected>Warm</option>
          <option value="hot">Hot — very interested</option>
          <option value="cold">Cold — not home / unsure</option>
        </select>
        <label>Notes</label>
        <textarea name="notes" placeholder="Conversation notes, best time to return..."></textarea>
        <input type="hidden" name="lat" value="${lat}">
        <input type="hidden" name="lng" value="${lng}">
        <button type="submit" class="btn">Save prospect</button>
      </form>
    `;
  }

  function loadProspects() {
    fetch('/api/prospects')
      .then((r) => r.json())
      .then((rows) => {
        prospectMarkers.clearLayers();
        rows.forEach((p) => {
          const marker = L.circleMarker([p.lat, p.lng], {
            radius: 9,
            color: '#1B2A41',
            weight: 2,
            fillColor: interestColor(p.interest_level),
            fillOpacity: 0.9
          });
          marker.bindPopup(`
            <strong>${escapeHtml(p.name)}</strong><br>
            <span style="font-size:12px;color:#555;">${escapeHtml(p.list_name || '')}</span><br>
            ${p.address ? `<span style="font-size:12px;">${escapeHtml(p.address)}</span><br>` : ''}
            ${p.phone ? `<span style="font-size:12px;">${escapeHtml(p.phone)}</span><br>` : ''}
            ${p.assigned_name ? `<span style="font-size:12px;">Assigned: ${escapeHtml(p.assigned_name)}</span><br>` : ''}
            <a href="/board" style="font-size:12px;">Open on board &rarr;</a>
          `);
          marker.addTo(prospectMarkers);
        });
      });
  }

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  map.on('click', (e) => {
    const { lat, lng } = e.latlng;
    if (clickMarker) map.removeLayer(clickMarker);
    clickMarker = L.marker([lat, lng]).addTo(map);
    clickMarker.bindPopup(popupFormHtml(lat.toFixed(6), lng.toFixed(6)), { minWidth: 260 }).openPopup();

    // Best-effort reverse geocode to prefill the address field
    fetch(`/api/reverse-geocode?lat=${lat}&lng=${lng}`)
      .then((r) => r.json())
      .then((data) => {
        const field = document.getElementById('addressField');
        if (field && data.address) field.value = data.address;
      })
      .catch(() => {});
  });

  // Delegate submit since the popup form is re-created on every click
  document.addEventListener('submit', function (e) {
    if (e.target.id !== 'prospectForm') return;
    e.preventDefault();
    const form = e.target;
    const payload = Object.fromEntries(new FormData(form).entries());

    fetch('/api/prospects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then((r) => r.json().then((data) => ({ ok: r.ok, data })))
      .then(({ ok, data }) => {
        if (!ok) throw new Error(data.error || 'Could not save.');
        map.closePopup();
        if (clickMarker) { map.removeLayer(clickMarker); clickMarker = null; }
        loadProspects();
      })
      .catch((err) => alert(err.message));
  });

  loadProspects();
})();
