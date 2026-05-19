// Centralized feature flags shared between client and server.
// Flip these to roll a feature out / pull it back. Keep names semantic.

export const FEATURE_FLAGS = {
  // Internal team chat (Messages → Team tab, channels, direct messages,
  // team voice calling, ICE servers). Hidden until release. When false,
  // the server returns 404 on /api/team/{channels,messages,members,ice-servers}
  // and the client hides the Team tab + crew Messages sidebar entry.
  TEAM_MESSAGES_ENABLED: false,
} as const;

export type FeatureFlagKey = keyof typeof FEATURE_FLAGS;
