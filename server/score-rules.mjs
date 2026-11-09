export const RUN_LIFETIME_MS = 4 * 60 * 60 * 1000;
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const TOKEN = /^[0-9a-f]{64}$/;

// Conservative bounds from the game: speed <=19, inside-lane curvature can
// increase centre-line progress by 1/0.6, racks >=45m apart, shots reach ahead.
// This rejects impossible claims; a bot can still imitate plausible client play.
export function validBowlingResult({ score, durationMs, strikes, knocked }, elapsedMs) {
  if (![score, durationMs, strikes, knocked].every(Number.isSafeInteger)) return false;
  if (durationMs < 0 || durationMs > RUN_LIFETIME_MS || durationMs > elapsedMs + 2500) return false;
  if (strikes < 0 || knocked < 0 || score !== strikes * 10 + knocked * 5 || score > 1000000) return false;
  const seconds = durationMs / 1000;
  const maxStrikes = seconds < 0.8 ? 0 : 3 + Math.floor(19 / 0.6 * seconds / 45);
  return strikes <= maxStrikes && knocked <= 6 + 3 * strikes && knocked <= 1 + Math.floor(seconds / 0.3);
}
