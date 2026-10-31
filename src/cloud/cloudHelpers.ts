import { CloudDatabase, FastRegisterRequest } from '../contracts/types.js';

export const ALLOWED_FAST_EMAIL_DOMAINS: readonly string[] = [
  'gmail.com',
  'hotmail.com',
  'outlook.com',
  'yahoo.com',
  'icloud.com',
  'proton.me',
  'protonmail.com',
  'yandex.com',
  'live.com',
  'msn.com',
];

/**
 * Generates automatic, policy-compliant anonymous parameters for 1-click temporary
 * database provisioning without requiring any personal information from the user.
 */
export function generateAnonymousFastRegisterParams(): FastRegisterRequest {
  const rand = Math.random()
    .toString(36)
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 6)
    .padEnd(4, 'x');
  const ts = Date.now()
    .toString(36)
    .replace(/[^a-z0-9]/g, '')
    .slice(-4);
  return {
    email: `axartmp${rand}${ts}@gmail.com`,
    dbName: `temp-db-${rand}`,
    subdomain: `axar-tmp-${rand}-${ts}`,
  };
}

export function validateFastRegisterEmail(email: string): { valid: boolean; error?: string } {
  const trimmed = email.trim().toLowerCase();
  if (!trimmed || !trimmed.includes('@')) {
    return { valid: false, error: 'Please enter a valid email address.' };
  }
  const parts = trimmed.split('@');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return { valid: false, error: 'Please enter a valid email address.' };
  }
  const [localPart, domain] = parts;
  if (localPart.includes('.')) {
    return {
      valid: false,
      error: 'Dots (.) are not allowed in the username part of the email address.',
    };
  }
  if (localPart.includes('+')) {
    return {
      valid: false,
      error: 'Plus (+) aliases are not allowed in the email address.',
    };
  }
  if (!ALLOWED_FAST_EMAIL_DOMAINS.includes(domain)) {
    return {
      valid: false,
      error: `Supported email providers: ${ALLOWED_FAST_EMAIL_DOMAINS.slice(0, 6).join(', ')}.`,
    };
  }
  return { valid: true };
}

export function validateSubdomain(subdomain: string): { valid: boolean; error?: string } {
  const trimmed = subdomain.trim().toLowerCase();
  if (!/^[a-z0-9-]{3,30}$/.test(trimmed)) {
    return {
      valid: false,
      error: 'Subdomain must be 3-30 characters and contain only lowercase letters (a-z), numbers (0-9), and hyphens (-).',
    };
  }
  if (trimmed.startsWith('-') || trimmed.endsWith('-')) {
    return {
      valid: false,
      error: 'Subdomain cannot start or end with a hyphen (-).',
    };
  }
  return { valid: true };
}

export interface CloudExpireSummary {
  /** Human-readable expiration date or policy text */
  expireDateText: string;
  /** Remaining time badge text */
  remainingText: string;
  /** Raw ISO date if applicable */
  isoDate: string | null;
  /** Visual severity status */
  status: 'ok' | 'warning' | 'expired' | 'permanent';
}

/**
 * Computes human-readable Expire Date and remaining time for a CloudDatabase.
 */
export function computeCloudExpireSummary(
  db: CloudDatabase,
  userEmailVerified?: boolean,
  nowMs: number = Date.now()
): CloudExpireSummary {
  const rawExpire = db.plan_expires_at || db.expires_at || null;

  // If unverified fast-registered account without explicit plan_expires_at, compute 1-hour trial expiry from created_at
  let effectiveIso = rawExpire;
  let isTrialUnverified = false;
  if (!effectiveIso && userEmailVerified === false && db.created_at) {
    const createdMs = Date.parse(db.created_at);
    if (!Number.isNaN(createdMs)) {
      effectiveIso = new Date(createdMs + 60 * 60 * 1000).toISOString();
      isTrialUnverified = true;
    }
  }

  if (effectiveIso) {
    const expMs = Date.parse(effectiveIso);
    if (!Number.isNaN(expMs)) {
      const formatted = formatIsoDateTime(effectiveIso);
      const diffMs = expMs - nowMs;

      if (diffMs <= 0 || db.is_expired) {
        return {
          expireDateText: formatted,
          remainingText: isTrialUnverified ? 'Trial Expired (Verify Email)' : 'Expired',
          isoDate: effectiveIso,
          status: 'expired',
        };
      }

      const diffMinutes = Math.ceil(diffMs / (60 * 1000));
      const diffHours = Math.floor(diffMs / (60 * 60 * 1000));
      const diffDays = Math.ceil(diffMs / (24 * 60 * 60 * 1000));

      if (diffHours < 1) {
        return {
          expireDateText: formatted,
          remainingText: `${diffMinutes} min left`,
          isoDate: effectiveIso,
          status: 'warning',
        };
      }
      if (diffHours < 72) {
        return {
          expireDateText: formatted,
          remainingText: `${diffHours} hours left`,
          isoDate: effectiveIso,
          status: 'warning',
        };
      }
      return {
        expireDateText: formatted,
        remainingText: `${diffDays} days left`,
        isoDate: effectiveIso,
        status: 'ok',
      };
    }
  }

  if (db.is_expired) {
    return {
      expireDateText: 'Quota / Term Expired',
      remainingText: 'Limit Reached',
      isoDate: null,
      status: 'expired',
    };
  }

  return {
    expireDateText: 'No Expiration (FREE Plan)',
    remainingText: '10K Daily Quota',
    isoDate: null,
    status: 'permanent',
  };
}

export function formatIsoDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return iso;
  }
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
