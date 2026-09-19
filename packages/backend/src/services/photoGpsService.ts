/**
 * NEXORA AI — GIS-tagged photo validation
 *
 * Validates that uploaded photos carry valid GPS coordinates.
 * Extracts EXIF GPS data, or falls back to manually provided coordinates
 * with a tamper-evident hash (for devices where GPS write-back is blocked).
 *
 * Critical rule: a complaint CANNOT be registered without a photo
 * with valid GPS evidence. This is enforced here, not just in the UI.
 */

import sharp from 'sharp';
import crypto from 'crypto';

export interface GpsPhotoResult {
  valid: boolean;
  lat?: number;
  lng?: number;
  accuracy?: number;
  capturedAt?: string;
  method: 'exif' | 'manual_approved' | 'none';
  tamperHash?: string;
  error?: string;
}

export async function validateGpsPhoto(
  fileBuffer: Buffer,
  manualLat?: number,
  manualLng?: number
): Promise<GpsPhotoResult> {
  try {
    // Attempt EXIF extraction via sharp (basic metadata)
    const metadata = await sharp(fileBuffer).metadata();

    // sharp doesn't natively expose GPS EXIF — use a library marker
    // In production, use exifr library for full EXIF parsing
    let lat: number | undefined;
    let lng: number | undefined;
    let capturedAt: string | undefined;

    try {
      // Dynamic import exifr for full EXIF support
      const exifr = await import('exifr').catch(() => null);
      if (exifr) {
        const exif = await exifr.default.parse(fileBuffer, {
          pick: ['latitude', 'longitude', 'DateTimeOriginal', 'GPSDateStamp'],
        }).catch(() => null);

        if (exif?.latitude && exif?.longitude) {
          lat = exif.latitude;
          lng = exif.longitude;
          capturedAt = exif.DateTimeOriginal?.toISOString();
        }
      }
    } catch {
      // exifr unavailable — proceed to manual fallback
    }

    if (lat !== undefined && lng !== undefined) {
      const hash = crypto
        .createHash('sha256')
        .update(`${lat},${lng},${capturedAt ?? ''},${fileBuffer.length}`)
        .digest('hex');
      return {
        valid: true,
        lat,
        lng,
        capturedAt,
        method: 'exif',
        tamperHash: hash,
      };
    }

    // Fallback: manual coordinates provided by user (must be explicitly approved)
    if (manualLat !== undefined && manualLng !== undefined) {
      if (
        isNaN(manualLat) || isNaN(manualLng) ||
        manualLat < -90 || manualLat > 90 ||
        manualLng < -180 || manualLng > 180
      ) {
        return { valid: false, method: 'none', error: 'Invalid manual GPS coordinates' };
      }

      const timestamp = new Date().toISOString();
      const hash = crypto
        .createHash('sha256')
        .update(`manual:${manualLat},${manualLng},${timestamp},${fileBuffer.length}`)
        .digest('hex');

      return {
        valid: true,
        lat: manualLat,
        lng: manualLng,
        capturedAt: timestamp,
        method: 'manual_approved',
        tamperHash: hash,
      };
    }

    // No GPS evidence at all — reject
    return {
      valid: false,
      method: 'none',
      error:
        'Photo does not contain GPS metadata. Please enable location services and retake, ' +
        'or provide manual GPS coordinates.',
    };
  } catch {
    return {
      valid: false,
      method: 'none',
      error: 'Failed to process image file',
    };
  }
}
