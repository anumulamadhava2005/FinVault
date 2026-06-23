/**
 * PaddleOCR 3.0 client for FinVault bill scanning.
 *
 * Sends a captured bill image (base64) to a locally running PaddleOCR server
 * and returns the full recognised text. Returns null on any failure so callers
 * can fall back to on-device ML Kit / Vision text recognition.
 *
 * Server setup — see scripts/paddle_ocr_server.py:
 *   pip install paddleocr fastapi "uvicorn[standard]" pillow
 *   uvicorn scripts.paddle_ocr_server:app --host 0.0.0.0 --port 8000
 *
 * Network routing:
 *   Android emulator → host machine  :  10.0.2.2
 *   iOS Simulator    → host machine  :  127.0.0.1
 *   Physical device  → set PADDLE_SERVER_URL to your LAN IP, e.g. 192.168.1.x
 */
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import Constants from 'expo-constants';

// ─── Configuration ────────────────────────────────────────────────────────────

const PADDLE_PORT = 8000;

/**
 * Resolve the OCR server host.
 *
 * Priority:
 *   1. `extra.paddleOcrHost` in app.json (explicit override for production/LAN).
 *   2. The Metro bundler's host (works automatically on a physical device —
 *      the dev machine running Metro is usually the same one running the
 *      PaddleOCR server).
 *   3. Platform loopback for emulators/simulators.
 */
const resolveHost = (): string => {
  const override = (Constants.expoConfig?.extra as Record<string, unknown> | undefined)?.paddleOcrHost;
  if (typeof override === 'string' && override.trim()) return override.trim();

  // hostUri looks like "192.168.1.5:8081" in dev — reuse the LAN IP.
  const hostUri =
    Constants.expoConfig?.hostUri ??
    (Constants as any).expoGoConfig?.debuggerHost ??
    (Constants.manifest2 as any)?.extra?.expoClient?.hostUri;
  const lanIp = typeof hostUri === 'string' ? hostUri.split(':')[0] : '';
  if (lanIp && lanIp !== 'localhost' && lanIp !== '127.0.0.1') return lanIp;

  return Platform.OS === 'android' ? '10.0.2.2' : '127.0.0.1';
};

/** Full OCR endpoint, resolved once at module load. */
export const PADDLE_SERVER_URL = `http://${resolveHost()}:${PADDLE_PORT}/ocr`;

const TIMEOUT_MS = 10_000;

// ─── Types ────────────────────────────────────────────────────────────────────

interface PaddleOcrResponse {
  text: string;
  line_count: number;
}

// ─── Health-check (optional, non-blocking) ───────────────────────────────────

/**
 * Ping the server. Returns true if the PaddleOCR backend is reachable.
 * Call this on app start to decide whether to surface the Paddle option.
 */
export const isPaddleAvailable = async (): Promise<boolean> => {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 3_000);
    const res = await fetch(
      PADDLE_SERVER_URL.replace('/ocr', '/health'),
      { signal: ctrl.signal },
    );
    clearTimeout(t);
    return res.ok;
  } catch {
    return false;
  }
};

// ─── Main OCR call ────────────────────────────────────────────────────────────

/**
 * Send an image file to the PaddleOCR 3.0 server and return the recognised text.
 *
 * @param imageUri  Local file URI produced by ImagePicker (file://…).
 * @returns         Recognised text string, or null if the server is unreachable
 *                  / the request fails — caller should fall back to on-device OCR.
 */
export const ocrWithPaddle = async (imageUri: string): Promise<string | null> => {
  try {
    // Read the image file as base64.
    const base64 = await FileSystem.readAsStringAsync(imageUri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    // POST with a hard timeout so a slow/dead server doesn't stall the UI.
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);

    let res: Response;
    try {
      res = await fetch(PADDLE_SERVER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64 }),
        signal: ctrl.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      console.warn(`PaddleOCR server returned HTTP ${res.status}`);
      return null;
    }

    const data: PaddleOcrResponse = await res.json();
    return typeof data.text === 'string' && data.text.trim() ? data.text : null;
  } catch (err: unknown) {
    // AbortError → timeout; TypeError → server not running; network error → offline.
    if (err instanceof Error && err.name !== 'AbortError') {
      console.warn('PaddleOCR request failed:', err.message);
    }
    return null;
  }
};
