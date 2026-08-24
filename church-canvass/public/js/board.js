(function () {
  document.querySelectorAll('.board-list-cards').forEach((el) => {
    new Sortable(el, {
      group: 'board',
      animation: 150,
      ghostClass: 'sortable-ghost',
      onEnd: function (evt) {
        const cardId = evt.item.getAttribute('data-card-id');
        const newListId = evt.to.getAttribute('data-list-id');
        const newPosition = evt.newIndex;
        fetch(`/api/cards/${cardId}/move`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ list_id: newListId, position: newPosition })
        }).then(() => updateCounts());
      }
    });
  });

  function updateCounts() {
    document.querySelectorAll('.board-list').forEach((list) => {
      const count = list.querySelectorAll('.prospect-card').length;
      list.querySelector('.count').textContent = count;
    });
  }

  function findCard(id) {
    const flat = window.BOARD_DATA.flatMap((l) => l.cards);
    return flat.find((c) => String(c.id) === String(id));
  }

  window.openCard = function (id) {
    const card = findCard(id);
    if (!card) return;
    document.getElementById('cardId').value = card.id;
    document.getElementById('cardName').value = card.name || '';
    document.getElementById('cardPhone').value = card.phone || '';
    document.getElementById('cardEmail').value = card.email || '';
    document.getElementById('cardAddress').value = card.address || '';
    document.getElementById('cardInterest').value = card.interest_level || 'warm';
    document.getElementById('cardAssigned').value = card.assigned_to || '';
    document.getElementById('cardNotes').value = card.notes || '';
    document.getElementById('modalBackdrop').classList.add('open');
  };

  window.closeModal = function () {
    document.getElementById('modalBackdrop').classList.remove('open');
  };

  document.getElementById('cardForm').addEventListener('submit', function (e) {
    e.preventDefault();
    const id = document.getElementById('cardId').value;
    const payload = {
      name: document.getElementById('cardName').value,
      phone: document.getElementById('cardPhone').value,
      email: document.getElementById('cardEmail').value,
      address: document.getElementById('cardAddress').value,
      interest_level: document.getElementById('cardInterest').value,
      assigned_to: document.getElementById('cardAssigned').value || null,
      notes: document.getElementById('cardNotes').value
    };
    fetch(`/api/cards/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(() => location.reload());
  });

  window.deleteCard = function () {
    const id = document.getElementById('cardId').value;
    if (!confirm('Delete this prospect card? This cannot be undone.')) return;
    fetch(`/api/cards/${id}`, { method: 'DELETE' }).then(() => location.reload());
  };
})();
