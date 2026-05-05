const paths = {
  add: '<path d="M12 5v14M5 12h14" />',
  plus: '<path d="M12 5v14M5 12h14" />',
  minus: '<path d="M6 12h12" />',
  close: '<path d="M6 6l12 12M18 6L6 18" />',
  back: '<path d="M14 6l-6 6 6 6" /><path d="M8 12h10" />',
  play: '<path d="M9 7l8 5-8 5z" />',
  pause: '<path d="M8 7v10M16 7v10" />',
  rewind3: '<path d="M11 12H6m0 0 4-4m-4 4 4 4" /><path d="M17 8v8" /><path d="M20 10.3a3 3 0 1 0 0 3.4" />',
  forward3: '<path d="M13 12h5m0 0-4-4m4 4-4 4" /><path d="M7 8v8" /><path d="M4 10.3a3 3 0 1 1 0 3.4" />',
  rewind5: '<path d="M11 12H6m0 0 4-4m-4 4 4 4" /><path d="M17 8v8" /><path d="M20 8.2A3.2 3.2 0 1 0 20 15.8" />',
  forward5: '<path d="M13 12h5m0 0-4-4m4 4-4 4" /><path d="M7 8v8" /><path d="M4 8.2A3.2 3.2 0 1 1 4 15.8" />',
  mirror: '<path d="M9 4v16" /><path d="M15 4v16" /><path d="M4 8l5 4-5 4" /><path d="M20 8l-5 4 5 4" />',
  search: '<circle cx="11" cy="11" r="6" /><path d="M20 20l-3.5-3.5" />',
  tags: '<path d="M20 13l-7 7a2 2 0 0 1-2.8 0L4 13V4h9l7 7z" /><circle cx="8.5" cy="8.5" r="1.2" />',
  edit: '<path d="M4 20h4l10.5-10.5a1.8 1.8 0 0 0 0-2.5l-1.5-1.5a1.8 1.8 0 0 0-2.5 0L4 16v4z" /><path d="M13.5 6.5l4 4" />',
  trash: '<path d="M4 7h16" /><path d="M9 7V5.8A1.8 1.8 0 0 1 10.8 4h2.4A1.8 1.8 0 0 1 15 5.8V7" /><path d="M6 7l1 13h10l1-13" /><path d="M10 11v6M14 11v6" />',
  sort: '<path d="M7 5v14" /><path d="M7 5l-3 3M7 5l3 3" /><path d="M17 19V5" /><path d="M17 19l-3-3M17 19l3-3" />',
  filter: '<path d="M4 5h16l-6.5 7.5V18l-3 1.8v-7.3L4 5z" />',
  'marker-add': '<path d="M12 4c-2.8 0-5 2.2-5 5 0 3.8 5 11 5 11s5-7.2 5-11c0-2.8-2.2-5-5-5z" /><path d="M12 7v4M10 9h4" />',
  'marker-jump': '<path d="M12 4c-2.8 0-5 2.2-5 5 0 3.8 5 11 5 11s5-7.2 5-11c0-2.8-2.2-5-5-5z" /><path d="M9 9h6" /><path d="M10 8l-2 1 2 1" />',
  'marker-delete': '<path d="M12 4c-2.8 0-5 2.2-5 5 0 3.8 5 11 5 11s5-7.2 5-11c0-2.8-2.2-5-5-5z" /><path d="M9.5 8.5l5 5M14.5 8.5l-5 5" />',
  'loop-set': '<path d="M6 8h8a4 4 0 0 1 0 8H7" /><path d="M9 5L6 8l3 3" /><path d="M18 16l-3 3-3-3" />',
  'loop-toggle': '<path d="M7 7h10l-2-2M17 17H7l2 2" /><path d="M7 7a4 4 0 0 0-4 4v1" /><path d="M17 17a4 4 0 0 0 4-4v-1" />',
  'loop-delete': '<path d="M6 6l12 12" /><path d="M8 8v8h8" /><path d="M7 7h10" />',
  'hide-ui': '<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z" /><circle cx="12" cy="12" r="2.2" />',
  'show-ui': '<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z" /><circle cx="12" cy="12" r="2.2" /><path d="M4 4l16 16" />',
};

export function icon(name){
  const inner = paths[name] || paths.close;
  return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${inner}</svg>`;
}

export function applyIcons(root = document){
  root.querySelectorAll('[data-icon]').forEach((el) => {
    const name = el.getAttribute('data-icon');
    el.innerHTML = icon(name);
  });
}
