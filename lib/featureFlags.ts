/**
 * Feature flags — flip here to re-enable UI features when network volume warrants it.
 */

/**
 * SHOW_COLLAB_FEATURES
 * Controls: Global Consensus stat card (home), Collab column (home + Isnad tables),
 * and NetworkAttestationsCard sidebar (Isnad profile).
 *
 * Set to true when the network has enough agents (~50+ active) to make these
 * metrics meaningful rather than misleading.
 */
export const SHOW_COLLAB_FEATURES = true
