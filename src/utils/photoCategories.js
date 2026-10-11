export const PHOTO_CATEGORIES = [
  { id: 'latest', label: '最新' },
  { id: 'random', label: '随览' },
  { id: 'nearby', label: '附近' },
  { id: 'far', label: '远方' },
  { id: 'film', label: '胶片' },
];

// Read older photos without requiring a database migration or deleting their data.
export const normalizePhotoCategory = (category) =>
  !category || category === 'featured' || category === '精选' ? 'latest' : category;
