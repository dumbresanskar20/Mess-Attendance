import { apiRequest } from '../api/client';

export interface BiometricAvailability {
  externalAvailable: boolean;
  externalDeviceName: string;
  inbuiltAvailable: boolean;
  inbuiltDeviceName: string;
  anyAvailable: boolean;
  status: 'BOTH' | 'EXTERNAL' | 'INBUILT' | 'NONE';
  primaryMethod: 'BOTH' | 'EXTERNAL' | 'INBUILT' | 'NONE';
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
 * Checks biometric availability for BOTH external hardware terminals (ZKTeco/eSSL)
 * AND internal platform biometric scanners (Windows Hello / Touch ID).
 */
export async function checkBiometricAvailability(): Promise<BiometricAvailability> {
  let externalAvailable = false;
  let externalDeviceName = '';

  // 1. Check External Biometric Terminal (via backend device status or local bridge)
  try {
    const status = await apiRequest('/device/status');
    if (status && (status.connected || status.online)) {
      externalAvailable = true;
      externalDeviceName =
        status.driver === 'zk'
          ? `ZKTeco/eSSL (${status.ip || 'LAN'})`
          : `External Terminal (${status.deviceId || 'DEV-COUNTER-01'})`;
    }
  } catch (err) {
    externalAvailable = false;
  }

  // Fallback direct check to local bridge if running locally on counter PC
  if (!externalAvailable && typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
    try {
      const bridgeController = new AbortController();
      const bridgeTimeout = setTimeout(() => bridgeController.abort(), 1200);
      const bridgeRes = await fetch('http://localhost:4001/status', { signal: bridgeController.signal });
      clearTimeout(bridgeTimeout);
      if (bridgeRes.ok) {
        const bData = await bridgeRes.json();
        if (bData && (bData.connected || bData.online)) {
          externalAvailable = true;
          externalDeviceName = `Local Terminal Bridge (${bData.driver || 'ZKTeco'})`;
        }
      }
    } catch {}
  }

  // 2. Check Device Inbuilt Platform Biometrics (Windows Hello / Mac Touch ID)
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
    } else if (/iPhone|iPad/i.test(navigator.userAgent)) {
      inbuiltDeviceName = 'Apple Face ID / Touch ID';
    }
  }

  // 3. Consolidate Dual Device Logic
  const anyAvailable = externalAvailable || inbuiltAvailable;
  let status: 'BOTH' | 'EXTERNAL' | 'INBUILT' | 'NONE' = 'NONE';
  let primaryMethod: 'BOTH' | 'EXTERNAL' | 'INBUILT' | 'NONE' = 'NONE';
  let message = '';

  if (externalAvailable && inbuiltAvailable) {
    status = 'BOTH';
    primaryMethod = 'BOTH';
    message = `Both biometric scanners online: External machine (${externalDeviceName}) and Laptop sensor (${inbuiltDeviceName}) are ready.`;
  } else if (externalAvailable) {
    status = 'EXTERNAL';
    primaryMethod = 'EXTERNAL';
    message = `External scanner connected: ${externalDeviceName}`;
  } else if (inbuiltAvailable) {
    status = 'INBUILT';
    primaryMethod = 'INBUILT';
    message = `Laptop fingerprint scanner detected: ${inbuiltDeviceName}`;
  } else {
    status = 'NONE';
    primaryMethod = 'NONE';
    const isSecure = typeof window !== 'undefined' && window.isSecureContext;
    if (!isSecure && typeof window !== 'undefined' && window.location.hostname !== 'localhost') {
      message =
        'Inbuilt biometrics require HTTPS when accessed from other devices over the local network (browser security policy).';
    } else {
      message =
        'No biometric sensor detected. Ensure an external machine is connected or Windows Hello/Touch ID is configured in settings.';
    }
  }

  return {
    externalAvailable,
    externalDeviceName,
    inbuiltAvailable,
    inbuiltDeviceName,
    anyAvailable,
    status,
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
    throw new Error('WebAuthn biometrics is not supported in this browser or requires HTTPS.');
  }

  const isAvailable = await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  if (!isAvailable) {
    throw new Error(
      'Device inbuilt fingerprint sensor (Touch ID / Windows Hello) is not available or not configured on this device.'
    );
  }

  const challenge = new Uint8Array(32);
  window.crypto.getRandomValues(challenge);

  // Encode student code as user id
  const userHandle = new TextEncoder().encode(studentCode.slice(0, 32));

  // Determine valid relying party ID (WebAuthn forbids IP addresses as rp.id)
  const isIpAddress = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(window.location.hostname);
  const rpConfig: { name: string; id?: string } = {
    name: 'Mess Attendance System',
  };
  if (window.location.hostname && !isIpAddress && window.location.hostname !== '127.0.0.1') {
    rpConfig.id = window.location.hostname;
  }

  try {
    const credential = (await navigator.credentials.create({
      publicKey: {
        challenge,
        rp: rpConfig,
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
