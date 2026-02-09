function validateJSON(payload) {
  try {
    JSON.parse(JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

module.exports = { validateJSON };
