/**
 * Registry of configurable business parameters (TOR FR-WS-08, NFR-03).
 *
 * The backend never hard-codes these numbers: services read the value that is
 * effective on a given date via the parameter service; new workspaces start
 * from `defaultValue` (FR-WS-08.4). `scope: 'system'` parameters are editable only by
 * SOM super admins (FR-WS-08.7); `scope: 'workspace'` ones by company admins / HR.
 *
 * Add a parameter here first, then read it in the API — never read a raw key string.
 * Defaults marked "TOR" come from TOR v1.0; the full table (FRD §15) is still pending.
 */

export type ParameterScope = 'system' | 'workspace';

interface BaseDef<T> {
  scope: ParameterScope;
  /** i18n key for the label shown in settings screens. */
  labelKey: string;
  defaultValue: T;
  /** Where the default comes from (TOR item, Lao labour law, or "provisional"). */
  source: string;
}

export interface IntParameterDef extends BaseDef<number> {
  type: 'int';
  min: number;
  max: number;
  /** Legal minimum (Lao labour law); values below are rejected with `below_legal_minimum`. */
  legalMin?: number;
  /** Legal maximum (Lao labour law); values above are rejected with `above_legal_maximum`. */
  legalMax?: number;
  unit?: 'days' | 'minutes' | 'hours' | 'seconds' | 'count' | 'digits';
}

export interface BooleanParameterDef extends BaseDef<boolean> {
  type: 'boolean';
}

export interface IntListParameterDef extends BaseDef<number[]> {
  type: 'intList';
  min: number;
  max: number;
  maxItems: number;
  unit?: 'days';
}

export type ParameterDef = IntParameterDef | BooleanParameterDef | IntListParameterDef;

export const PARAMETERS = {
  // ── System (SOM only) ──
  'auth.lockout.maxAttempts': {
    type: 'int', scope: 'system', labelKey: 'param.auth.lockout.maxAttempts', defaultValue: 5, min: 3, max: 20, unit: 'count',
    source: 'TOR FR-AUTH-05',
  },
  'auth.lockout.minutes': {
    type: 'int', scope: 'system', labelKey: 'param.auth.lockout.minutes', defaultValue: 15, min: 1, max: 1440, unit: 'minutes',
    source: 'provisional (FRD §15 pending)',
  },
  'otp.length': {
    type: 'int', scope: 'system', labelKey: 'param.otp.length', defaultValue: 6, min: 4, max: 8, unit: 'digits',
    source: 'provisional (FRD §15 pending)',
  },
  'otp.ttlMinutes': {
    type: 'int', scope: 'system', labelKey: 'param.otp.ttlMinutes', defaultValue: 5, min: 1, max: 30, unit: 'minutes',
    source: 'provisional (FRD §15 pending)',
  },
  'otp.maxAttempts': {
    type: 'int', scope: 'system', labelKey: 'param.otp.maxAttempts', defaultValue: 5, min: 1, max: 10, unit: 'count',
    source: 'provisional (FRD §15 pending)',
  },
  'otp.resendCooldownSeconds': {
    type: 'int', scope: 'system', labelKey: 'param.otp.resendCooldownSeconds', defaultValue: 60, min: 10, max: 600, unit: 'seconds',
    source: 'provisional (FRD §15 pending)',
  },
  'otp.maxPerHour': {
    type: 'int', scope: 'system', labelKey: 'param.otp.maxPerHour', defaultValue: 5, min: 1, max: 20, unit: 'count',
    source: 'provisional (FRD §15 pending)',
  },
  // ── Workspace ──
  'document.expiryAlertDays': {
    type: 'intList', scope: 'workspace', labelKey: 'param.document.expiryAlertDays', defaultValue: [90, 60, 30, 7],
    min: 1, max: 365, maxItems: 6, unit: 'days', source: 'TOR FR-EMP-05.1',
  },
  'approval.escalationWorkingDays': {
    type: 'int', scope: 'workspace', labelKey: 'param.approval.escalationWorkingDays', defaultValue: 2, min: 1, max: 30, unit: 'days',
    source: 'TOR FR-ORG-05.1',
  },
  /** How many levels of the chain of command must approve a request; 1 = the direct manager only (FR-ORG-02). */
  'approval.levels': {
    type: 'int', scope: 'workspace', labelKey: 'param.approval.levels', defaultValue: 1, min: 1, max: 5, unit: 'count',
    source: 'TOR FR-ORG-02; depth provisional (FRD §15 pending)',
  },
  'notification.smsEnabled': {
    type: 'boolean', scope: 'workspace', labelKey: 'param.notification.smsEnabled', defaultValue: false,
    source: 'TOR FR-NOTI-02.3',
  },
  /** Most data rows one employee import file may hold (FR-EMP-09); bounds parsing and the all-or-nothing import transaction. */
  'employee.importMaxRows': {
    type: 'int', scope: 'workspace', labelKey: 'param.employee.importMaxRows', defaultValue: 1000, min: 1, max: 2000, unit: 'count',
    source: 'provisional (FRD §15 pending)',
  },
  /** Length of a full working day; also the most any scheduled day may have (FR-WS-03.1). */
  'schedule.standardHoursPerDay': {
    type: 'int', scope: 'workspace', labelKey: 'param.schedule.standardHoursPerDay', defaultValue: 8, min: 1, max: 24, legalMax: 8,
    unit: 'hours', source: 'TOR FR-WS-03.1; Lao Labour Law: normal hours at most 8 h/day',
  },
  /** Most scheduled hours a week pattern may total (FR-WS-03.1). */
  'schedule.maxHoursPerWeek': {
    type: 'int', scope: 'workspace', labelKey: 'param.schedule.maxHoursPerWeek', defaultValue: 48, min: 1, max: 168, legalMax: 48,
    unit: 'hours', source: 'TOR FR-WS-03.1; Lao Labour Law: normal hours at most 48 h/week',
  },
} as const satisfies Record<string, ParameterDef>;

export type ParameterKey = keyof typeof PARAMETERS;
export type ParameterValue<K extends ParameterKey> = (typeof PARAMETERS)[K]['defaultValue'] extends number
  ? number
  : (typeof PARAMETERS)[K]['defaultValue'] extends boolean
    ? boolean
    : number[];

export const PARAMETER_KEYS = Object.keys(PARAMETERS) as ParameterKey[];

export const parameterKeysByScope = (scope: ParameterScope): ParameterKey[] =>
  PARAMETER_KEYS.filter((k) => PARAMETERS[k].scope === scope);

export const isParameterKey = (key: string): key is ParameterKey => key in PARAMETERS;

export type ParameterValidationError =
  | 'unknown_parameter'
  | 'invalid_type'
  | 'out_of_range'
  | 'below_legal_minimum'
  | 'above_legal_maximum'
  | 'too_many_items';

/**
 * Validate a candidate value against the registry (FR-WS-08.3).
 * Returns `null` when valid. Used by the API before saving; UIs may call it for early feedback only.
 */
export const validateParameterValue = (key: string, value: unknown): ParameterValidationError | null => {
  if (!isParameterKey(key)) return 'unknown_parameter';
  const def: ParameterDef = PARAMETERS[key];
  switch (def.type) {
    case 'boolean':
      return typeof value === 'boolean' ? null : 'invalid_type';
    case 'int': {
      if (typeof value !== 'number' || !Number.isInteger(value)) return 'invalid_type';
      if (def.legalMin !== undefined && value < def.legalMin) return 'below_legal_minimum';
      if (def.legalMax !== undefined && value > def.legalMax) return 'above_legal_maximum';
      return value < def.min || value > def.max ? 'out_of_range' : null;
    }
    case 'intList': {
      if (!Array.isArray(value) || value.some((v) => typeof v !== 'number' || !Number.isInteger(v))) return 'invalid_type';
      if (value.length === 0 || value.length > def.maxItems) return 'too_many_items';
      return value.some((v: number) => v < def.min || v > def.max) ? 'out_of_range' : null;
    }
  }
};

/** Registry definition for a key (throws for unknown keys — validate first). */
export const parameterDefinition = (key: ParameterKey): ParameterDef => PARAMETERS[key];

/**
 * Calendar date (YYYY-MM-DD) of instant `at` in an IANA time zone.
 * Workspace parameters are effective from a date in the workspace's time zone (FR-WS-08.5).
 */
export const isoDateInTimeZone = (timeZone: string, at: Date = new Date()): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);

/** True when `timeZone` is an IANA zone the runtime understands (e.g. "Asia/Vientiane"). */
export const isValidTimeZone = (timeZone: string): boolean => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
};
