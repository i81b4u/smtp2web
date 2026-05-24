function validateJSON(payload) {
  try {
    // Current validation checks that the payload is JSON-serializable. Replace
    // this with schema validation if the downstream contract becomes stricter.
    JSON.parse(JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

module.exports = { validateJSON };
