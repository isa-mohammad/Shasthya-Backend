export function dbError(res, error, status = 500) {
  console.error('[DB Error]', error);
  return res.status(status).json({ error: error.message });
}

export function notFound(res, entity = 'Resource') {
  return res.status(404).json({ error: `${entity} not found` });
}
