export const buildSortObject = (orderBy, order, defaultSort = { createdAt: -1 }) => {
  if (orderBy) {
    return { [orderBy]: order === 'asc' ? 1 : -1 };
  }
  return defaultSort;
};
