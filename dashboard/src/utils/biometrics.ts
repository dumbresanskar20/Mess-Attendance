import { apiRequest } from '../api/client';

export interface BiometricAvailability {
  externalAvailable: boolean;
  externalDeviceName: string;
  inbuiltAvailable: boolean;
  inbuiltDeviceName: string;
  primaryMethod: 'EXTERNAL' | 'INBUILT' | 'NONE';
  message: string;
}

export interface BiometricCaptureResult {
  rawTemplate: string;
  source: 'EXTERNAL_DEVICE' | 'INBUILT_DEVICE';
  fingerLabel: string;
  deviceUserId?: string;
  details: string;
}

/**
 * Checks whether an external hardware scanner is connected OR device inbuilt fingerprint (Touch ID / Windows Hello) is available.
 */
export async function checkBiometricAvailability(): Promise<BiometricAvailability> {
  let externalAvailable = false;
  let externalDeviceName = '';

  try {
    const status = await apiRequest('/device/status');
    // External hardware scanner is connected if bridge is connected and driver is real physical hardware (zk)
    if (status && status.connected && status.driver === 'zk') {
      externalAvailable = true;
      externalDeviceName = `ZKTeco/eSSL (${status.ip || 'LAN'})`;
    }
  } catch (err) {
    externalAvailable = false;
  }

  // Check device inbuilt biometric (Touch ID / Windows Hello)
  let inbuiltAvailable = false;
  const isWebAuthnSupported =
    typeof window !== 'undefined' &&
    typeof window.PublicKeyCredential !== 'undefined' &&
    typeof window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === 'function';

  if (isWebAuthnSupported) {
    try {
      inbuiltAvailable = await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    } catch (e) {
      inbuiltAvailable = false;
    }
  }

  let inbuiltDeviceName = 'Touch ID / Platform Biometrics';
  if (typeof navigator !== 'undefined') {
    if (/Macintosh|Mac OS X/i.test(navigator.userAgent)) {
      inbuiltDeviceName = 'Mac Touch ID';
    } else if (/Windows/i.test(navigator.userAgent)) {
      inbuiltDeviceName = 'Windows Hello Fingerprint';
    } else if (/Android/i.test(navigator.userAgent)) {
      inbuiltDeviceName = 'Android Biometric Sensor';
    }
  }

  let primaryMethod: 'EXTERNAL' | 'INBUILT' | 'NONE' = 'NONE';
  let message = '';

  if (externalAvailable) {
    primaryMethod = 'EXTERNAL';
    message = `External scanner connected: ${externalDeviceName}`;
  } else if (inbuiltAvailable) {
    primaryMethod = 'INBUILT';
    message = `External scanner not connected. Using device inbuilt sensor: ${inbuiltDeviceName}`;
  } else {
    primaryMethod = 'NONE';
    message =
      'No biometric sensor detected. Neither external scanner nor device inbuilt fingerprint sensor (Touch ID) is available.';
  }

  return {
    externalAvailable,
    externalDeviceName,
    inbuiltAvailable,
    inbuiltDeviceName,
    primaryMethod,
    message,
  };
}

/**
 * Prompts user for Device Inbuilt Fingerprint (Touch ID / Windows Hello) via WebAuthn platform authenticator.
 */
export async function captureInbuiltFingerprint(
  studentCode: string,
  studentName: string,
  fingerLabel: string = 'Right index'
): Promise<BiometricCaptureResult> {
  if (!window.PublicKeyCredential) {
    throw new Error('WebAuthn biometrics is not supported in this browser.');
  }

  const isAvailable = await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  if (!isAvailable) {
    throw new Error(
      'Device inbuilt fingerprint sensor (Touch ID / Platform Biometrics) is not available or not configured on this device.'
    );
  }

  const challenge = new Uint8Array(32);
  window.crypto.getRandomValues(challenge);

  // Encode student code as user id
  const userHandle = new TextEncoder().encode(studentCode.slice(0, 32));

  try {
    const credential = (await navigator.credentials.create({
      publicKey: {
        challenge,
        rp: {
          name: 'Mess Attendance System',
          id: window.location.hostname || 'localhost',
        },
        user: {
          id: userHandle,
          name: studentCode,
          displayName: studentName || studentCode,
        },
        pubKeyCredParams: [
          { alg: -7, type: 'public-key' }, // ES256
          { alg: -257, type: 'public-key' }, // RS256
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform', // Strictly device inbuilt (Touch ID, Windows Hello)
          userVerification: 'required',
          requireResidentKey: false,
        },
        timeout: 60000,
        attestation: 'none',
      },
    })) as PublicKeyCredential | null;

    if (!credential) {
      throw new Error('Biometric verification cancelled or timed out.');
    }

    const rawTemplate = `INBUILT_BIO_${credential.id}_${Date.now()}`;

    return {
      rawTemplate,
      source: 'INBUILT_DEVICE',
      fingerLabel,
      deviceUserId: `inbuilt_${studentCode.replace(/[^a-zA-Z0-9]/g, '_')}`,
      details: 'Verified via Device Inbuilt Fingerprint (Touch ID)',
    };
  } catch (err: any) {
    if (err.name === 'NotAllowedError') {
      throw new Error('Biometric scan cancelled or permission denied on device.');
    }
    if (err.name === 'AbortError') {
      throw new Error('Biometric scan was aborted.');
    }
    throw new Error(err.message || 'Failed to capture device inbuilt fingerprint.');
  }
}

/**
 * Captures fingerprint from external hardware terminal.
 */
export async function captureExternalFingerprint(
  deviceUserId: string,
  fingerLabel: string = 'Right index'
): Promise<BiometricCaptureResult> {
  const enrollRes = await apiRequest('/device/enroll', {
    method: 'POST',
    body: JSON.stringify({
      deviceUserId,
      fingerIndex: 1,
    }),
  });

  if (!enrollRes || !enrollRes.rawTemplate) {
    throw new Error('External scanner did not return a valid fingerprint template.');
  }

  return {
    rawTemplate: enrollRes.rawTemplate,
    source: 'EXTERNAL_DEVICE',
    fingerLabel,
    deviceUserId,
    details: 'Captured via External Biometric Scanner',
  };
}
