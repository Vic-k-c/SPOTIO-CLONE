// Each template just seeds a starting set of lists. Everything stays fully
// editable afterward -- this is a starting point, not a locked structure.
const TEMPLATES = {
  soul_winning: {
    label: 'Soul Winning',
    icon: '\u2721', // cross
    lists: ['New Prospect', 'Contacted', 'Follow-Up', 'Bible Study', 'Decision Made', 'Not Interested']
  },
  marketing: {
    label: 'Marketing Pipeline',
    icon: '\u25B2',
    lists: ['Leads', 'Contacted', 'Proposal Sent', 'Negotiation', 'Won', 'Lost']
  },
  online_classes: {
    label: 'Online Classes',
    icon: '\u25CE',
    lists: ['Enrolled', 'Onboarding', 'In Progress', 'Needs Follow-up', 'Completed', 'Dropped']
  },
  todo: {
    label: 'Simple To-Do',
    icon: '\u2713',
    lists: ['To Do', 'In Progress', 'Done']
  },
  blank: {
    label: 'Blank Board',
    icon: '\u25A1',
    lists: ['To Do', 'Doing', 'Done']
  }
};

function getTemplate(key) {
  return TEMPLATES[key] || TEMPLATES.blank;
}

module.exports = { TEMPLATES, getTemplate };
