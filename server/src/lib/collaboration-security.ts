import crypto from 'node:crypto';

// Public invite URL tokens are bearer credentials. Keep them random, high
// entropy, and never derive them from user IDs, timestamps, or task IDs.
export const createCollaborationInviteToken = () => crypto.randomBytes(24).toString('base64url');
