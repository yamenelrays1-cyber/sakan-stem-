import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isEmailJsConfigured,
  formatEmailJsError,
  validateOtpCodeInput,
  OTP_EXPIRY_MS,
  MAX_AUTH_ATTEMPTS,
  AUTH_LOCKOUT_SECONDS,
  sanitizeTextInput,
  normalizeDormRoomInput,
  hasDangerousInjectionPayload,
  validateEmailInput,
  validatePasswordInput,
  validateStudentProfileInput,
  evaluateAttemptRateLimit,
  createVerifiedSessionPayload,
  verifySessionPayload,
  hashPassword,
  verifyPasswordHash,
} from './emailOtpService';

test('isEmailJsConfigured returns true only when all three EmailJS keys are non-empty', () => {
  assert.equal(
    isEmailJsConfigured({
      serviceId: 'service_123',
      templateId: 'template_456',
      publicKey: 'pub_789',
    }),
    true
  );
  assert.equal(
    isEmailJsConfigured({
      serviceId: 'service_123',
      templateId: '',
      publicKey: 'pub_789',
    }),
    false
  );
  assert.equal(isEmailJsConfigured({}), false);
});

test('formatEmailJsError classifies network, auth, template, and rate-limit errors accurately', () => {
  const netErr = formatEmailJsError(new Error('Failed to fetch'));
  assert.equal(netErr.code, 'NETWORK_ERROR');
  assert.ok(netErr.messageAr.includes('الشبكة'));

  const rateErr = formatEmailJsError({ status: 429, text: 'Too many requests' });
  assert.equal(rateErr.code, 'RATE_LIMIT');
  assert.ok(rateErr.messageAr.includes('الحد المسموح'));

  const tplErr = formatEmailJsError({ status: 400, text: 'The template_id is invalid' });
  assert.equal(tplErr.code, 'TEMPLATE_ERROR');
  assert.ok(tplErr.messageAr.includes('Template ID'));

  const authErr = formatEmailJsError({ status: 401, text: 'The Public Key is invalid' });
  assert.equal(authErr.code, 'AUTH_ERROR');
  assert.ok(authErr.messageAr.includes('Public Key'));
});

test('validateOtpCodeInput enforces 4-digit format, strict matching, and 5-minute expiration', () => {
  assert.equal(validateOtpCodeInput('12').valid, false);
  assert.equal(validateOtpCodeInput('1234', '5678', true).valid, false);
  assert.equal(validateOtpCodeInput('5678', '5678', true).valid, true);
  assert.equal(validateOtpCodeInput('1234', '5678', false).valid, true);

  const now = 1_700_000_000_000;
  const validExpiry = now + OTP_EXPIRY_MS;
  assert.equal(validateOtpCodeInput('5678', '5678', true, validExpiry, now).valid, true);

  const expiredAt = now - 1000;
  const expiredCheck = validateOtpCodeInput('5678', '5678', true, expiredAt, now);
  assert.equal(expiredCheck.valid, false);
  assert.ok(expiredCheck.errorAr?.includes('انتهت صلاحية'));
});

test('sanitizeTextInput and hasDangerousInjectionPayload block XSS and SQL injection patterns', () => {
  assert.equal(hasDangerousInjectionPayload('<script>alert(1)</script>'), true);
  assert.equal(hasDangerousInjectionPayload("admin' OR 1=1 --"), true);
  assert.equal(hasDangerousInjectionPayload('javascript:evil()'), true);
  assert.equal(hasDangerousInjectionPayload('أحمد محمد'), false);

  const cleaned = sanitizeTextInput('  <img src=x onerror=alert(1)>أحمد  ');
  assert.equal(cleaned.includes('<'), false);
  assert.equal(cleaned.includes('>'), false);
  assert.equal(cleaned.includes('onerror='), false);
});

test('validateEmailInput, validatePasswordInput, and validateStudentProfileInput validate all fields', () => {
  assert.equal(validateEmailInput('').valid, false);
  assert.equal(validateEmailInput('not-an-email').valid, false);
  assert.equal(validateEmailInput('student@gmail.com').valid, true);

  assert.equal(validatePasswordInput('123').valid, false);
  assert.equal(validatePasswordInput('securePass123').valid, true);

  assert.equal(validateStudentProfileInput('أ', 'غرفة 404', ['غرفة 404']).valid, false);
  assert.equal(validateStudentProfileInput('أحمد', 'غرفة 404').valid, false);
  assert.equal(validateStudentProfileInput('أحمد علي', '').valid, false);
  assert.equal(validateStudentProfileInput('أحمد علي', '   ').valid, false);
  assert.equal(validateStudentProfileInput('أحمد علي', 'بدون رقم').valid, false);
  assert.equal(validateStudentProfileInput('أحمد علي', '0').valid, false);
  assert.equal(validateStudentProfileInput('أحمد علي', 'غرفة 999', ['غرفة 404']).valid, false);
  assert.equal(validateStudentProfileInput('أحمد علي', 'غرفة 404', ['غرفة 404']).valid, true);

  // User-typed room numbers (without dropdown) normalize cleanly to "غرفة <number>"
  const typedNumeric = validateStudentProfileInput('أحمد علي', '404');
  assert.equal(typedNumeric.valid, true);
  assert.equal(typedNumeric.sanitizedRoom, 'غرفة 404');

  const typedArabicDigits = validateStudentProfileInput('أحمد علي', '٤٠٥');
  assert.equal(typedArabicDigits.valid, true);
  assert.equal(typedArabicDigits.sanitizedRoom, 'غرفة 405');

  const typedCustomRoom = validateStudentProfileInput('أحمد علي', '302');
  assert.equal(typedCustomRoom.valid, true);
  assert.equal(typedCustomRoom.sanitizedRoom, 'غرفة 302');

  assert.equal(normalizeDormRoomInput('408'), 'غرفة 408');
  assert.equal(normalizeDormRoomInput('غرفه 409'), 'غرفة 409');
  assert.equal(normalizeDormRoomInput(''), '');
});

test('evaluateAttemptRateLimit locks out after 3 failed tries (MAX_AUTH_ATTEMPTS = 3) for 60 seconds', () => {
  assert.equal(MAX_AUTH_ATTEMPTS, 3);
  const t0 = 1_700_000_000_000;
  let failed = 0;
  let lockUntil = 0;

  for (let i = 1; i < MAX_AUTH_ATTEMPTS; i++) {
    const res = evaluateAttemptRateLimit(failed, lockUntil, t0);
    assert.equal(res.isLocked, false);
    assert.equal(res.nextFailedAttempts, i);
    failed = res.nextFailedAttempts;
    lockUntil = res.nextLockedUntilMs;
  }

  // 3rd failed attempt triggers 60s lockout
  const third = evaluateAttemptRateLimit(failed, lockUntil, t0);
  assert.equal(third.isLocked, true);
  assert.equal(third.remainingSeconds, AUTH_LOCKOUT_SECONDS);

  // Subsequent attempt 10s later is still blocked
  const duringLockout = evaluateAttemptRateLimit(
    third.nextFailedAttempts,
    third.nextLockedUntilMs,
    t0 + 10_000
  );
  assert.equal(duringLockout.isLocked, true);

  // Attempt after 61s resets lockout counter to 1 on a new failed attempt
  const afterLockout = evaluateAttemptRateLimit(
    third.nextFailedAttempts,
    third.nextLockedUntilMs,
    t0 + 61_000
  );
  assert.equal(afterLockout.isLocked, false);
  assert.equal(afterLockout.nextFailedAttempts, 1);
});

test('createVerifiedSessionPayload and verifySessionPayload prevent tampered or incomplete localStorage bypass', () => {
  const validRooms = ['غرفة 404', 'غرفة 405', 'غرفة 406'] as const;
  const now = 1_700_000_000_000;
  const record = createVerifiedSessionPayload('student@gmail.com', 'أحمد سامي', 'غرفة 405', now);
  const verified = verifySessionPayload(record, validRooms, now + 1000);
  assert.equal(verified.valid, true);
  assert.equal(verified.session?.email, 'student@gmail.com');
  assert.equal(verified.session?.room, 'غرفة 405');

  // Tampering with room or signature invalidates session
  const tampered = { ...record, room: 'غرفة 406' };
  assert.equal(verifySessionPayload(tampered, validRooms, now + 1000).valid, false);
  assert.equal(verifySessionPayload('true', validRooms, now + 1000).valid, false);
  assert.equal(verifySessionPayload(null, validRooms, now + 1000).valid, false);
});

test('hashPassword and verifyPasswordHash securely hash passwords with per-email salt and verify matches', () => {
  const hash1 = hashPassword('MySecretPass123', 'user1@gmail.com');
  const hash2 = hashPassword('MySecretPass123', 'user2@gmail.com');

  assert.equal(hash1.startsWith('sakan_hash_v1$'), true);
  assert.equal(hash1.includes('MySecretPass123'), false);
  assert.notEqual(hash1, hash2);

  assert.equal(verifyPasswordHash('MySecretPass123', 'user1@gmail.com', hash1), true);
  assert.equal(verifyPasswordHash('WrongPass999', 'user1@gmail.com', hash1), false);
  assert.equal(verifyPasswordHash('MySecretPass123', 'user2@gmail.com', hash1), false);
});


