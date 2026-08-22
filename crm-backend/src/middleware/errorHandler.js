function errorHandler(err, _req, res, _next) {
  if (err.name === 'ValidationError') {
    return res.status(400).json({ error: err.message });
  }
  if (err.name === 'CastError') {
    return res.status(400).json({ error: 'Invalid id' });
  }
  if (err.code === 11000) {
    return res.status(409).json({ error: 'Duplicate value', keyValue: err.keyValue });
  }
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
}

module.exports = { errorHandler };
