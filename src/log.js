// Anything shaped like a full API key is scrubbed from every line as a
// safety net. Display prefixes (8 chars) are too short to match.
const KEY_PATTERN = /th_[A-Za-z0-9_-]{20,}/g;

function scrub(line) {
  return line.replace(KEY_PATTERN, '[REDACTED]');
}

// Writes one JSON line per call. Callers pass explicit fields only;
// never pass request headers or bodies.
function createLogger(write = (line) => process.stdout.write(line + '\n')) {
  const emit = (level, fields) =>
    write(scrub(JSON.stringify({ time: new Date().toISOString(), level, ...fields })));
  return {
    info: (fields) => emit('info', fields),
    error: (fields) => emit('error', fields),
  };
}

module.exports = { createLogger, scrub };
