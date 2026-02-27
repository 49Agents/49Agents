/**
 * Sanitize a session/identifier name to only allow safe characters.
 * Only allows alphanumeric, dash, and underscore characters.
 */
export function sanitizeIdentifier(name) {
  const sanitized = name.replace(/[^a-zA-Z0-9_-]/g, '');
  if (!sanitized) {
    throw new Error('Invalid identifier: must contain alphanumeric, dash, or underscore characters');
  }
  return sanitized.slice(0, 64);
}

/**
 * Escape a string for safe use in shell commands.
 * Uses single quotes to prevent all shell interpretation.
 */
export function escapeShellArg(arg) {
  return "'" + arg.replace(/'/g, "'\\''") + "'";
}

/**
 * Validate that a number is a positive integer within reasonable bounds.
 */
export function validatePositiveInt(value, max = 10000) {
  const num = Math.floor(value);
  if (num <= 0 || num > max || !Number.isFinite(num)) {
    throw new Error(`Invalid number: must be a positive integer up to ${max}`);
  }
  return num;
}

/**
 * Validate and resolve a working directory path.
 */
export function validateWorkingDirectory(workingDir) {
  const home = process.env.HOME || '/home';
  let expandedPath = workingDir;

  if (expandedPath.startsWith('~')) {
    expandedPath = expandedPath.replace('~', home);
  }

  // Basic path validation - must be under home or /tmp
  const allowedPrefixes = [home, '/tmp'];
  const isAllowed = allowedPrefixes.some(prefix =>
    expandedPath === prefix || expandedPath.startsWith(prefix + '/')
  );

  if (!isAllowed) {
    throw new Error(`Working directory path not allowed: ${workingDir}`);
  }

  return expandedPath;
}
