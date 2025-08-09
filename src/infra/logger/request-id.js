const { v4: uuidv4 } = require('uuid');
const logger = require('./index');

function requestId(req, res, next) {
  const id = req.headers['x-request-id'] || uuidv4();
  req.request_id = id;
  res.setHeader('x-request-id', id);
  req.log = logger.child({ request_id: id });
  next();
}

module.exports = requestId;
