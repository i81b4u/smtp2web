const SCHEMA_VERSION = 1;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isTimestamp(value) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

// Validate smtp2web's own durable payload contract. This intentionally does
// not validate RFC mailbox syntax or require optional message headers: real
// devices frequently produce legitimate mail without them.
function validatePayload(payload) {
  const errors = [];

  if (!isObject(payload)) {
    return { valid: false, errors: ['payload must be an object'] };
  }

  if (!isObject(payload.meta)) {
    errors.push('meta must be an object');
  } else {
    // Queue files created before schema versioning did not have this field.
    // Keep them replayable during upgrades, but reject any explicitly unknown
    // schema version.
    if (payload.meta.schemaVersion !== undefined && payload.meta.schemaVersion !== SCHEMA_VERSION) {
      errors.push(`meta.schemaVersion must be ${SCHEMA_VERSION}`);
    }
    if (typeof payload.meta.messageId !== 'string' || !UUID_PATTERN.test(payload.meta.messageId)) {
      errors.push('meta.messageId must be a UUID');
    }
    if (!isTimestamp(payload.meta.receivedAt)) {
      errors.push('meta.receivedAt must be an ISO-8601 timestamp');
    }
  }

  if (!isObject(payload.mail)) {
    errors.push('mail must be an object');
  } else if (payload.mail.attachments !== undefined) {
    if (!Array.isArray(payload.mail.attachments)) {
      errors.push('mail.attachments must be an array');
    } else {
      payload.mail.attachments.forEach((attachment, index) => {
        if (!isObject(attachment)) {
          errors.push(`mail.attachments[${index}] must be an object`);
        } else if (typeof attachment.content !== 'string') {
          errors.push(`mail.attachments[${index}].content must be a base64 string`);
        }
      });
    }
  }

  if (!isObject(payload.session)) {
    errors.push('session must be an object');
  } else {
    if (typeof payload.session.remoteAddress !== 'string' || !payload.session.remoteAddress) {
      errors.push('session.remoteAddress must be a non-empty string');
    }
    if (typeof payload.session.tls !== 'boolean') {
      errors.push('session.tls must be a boolean');
    }
  }

  return { valid: errors.length === 0, errors };
}

function validateJSON(payload) {
  return validatePayload(payload).valid;
}

module.exports = { SCHEMA_VERSION, validatePayload, validateJSON };
