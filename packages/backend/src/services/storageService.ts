/**
 * NEXORA AI — File Storage Adapter
 *
 * Uses IBM Cloud Object Storage if configured; falls back to local disk.
 * To enable production: set IBM_COS_ENDPOINT, IBM_COS_API_KEY, IBM_COS_BUCKET,
 * IBM_COS_SERVICE_INSTANCE_ID in .env
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { config } from '../config/env';
import { logger } from '../utils/logger';

const LOCAL_UPLOAD_DIR = path.join(process.cwd(), 'uploads');

export const storageService = {
  async upload(
    fileBuffer: Buffer,
    originalName: string,
    mimeType: string,
    folder: string = 'general'
  ): Promise<string> {
    const ext = path.extname(originalName);
    const filename = `${folder}/${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`;

    if (!config.IBM_COS_API_KEY) {
      // Local storage fallback
      const localPath = path.join(LOCAL_UPLOAD_DIR, filename);
      fs.mkdirSync(path.dirname(localPath), { recursive: true });
      fs.writeFileSync(localPath, fileBuffer);
      logger.info(`[Storage MOCK] Saved locally: ${localPath}`);
      return `/uploads/${filename}`;
    }

    // IBM Cloud Object Storage
    try {
      // ibm-cos-sdk is an optional dependency — only loaded if configured
      const ibmCos: any = await import('ibm-cos-sdk' as any).catch(() => null);
      if (!ibmCos) {
        throw new Error('ibm-cos-sdk not installed');
      }
      const cos = new ibmCos.S3({
        endpoint: config.IBM_COS_ENDPOINT,
        apiKeyId: config.IBM_COS_API_KEY,
        serviceInstanceId: config.IBM_COS_SERVICE_INSTANCE_ID,
        ibmAuthEndpoint: 'https://iam.cloud.ibm.com/identity/token',
      });
      await cos.putObject({
        Bucket: config.IBM_COS_BUCKET!,
        Key: filename,
        Body: fileBuffer,
        ContentType: mimeType,
      }).promise();
      return `${config.IBM_COS_ENDPOINT}/${config.IBM_COS_BUCKET}/${filename}`;
    } catch (err) {
      logger.error('[Storage] IBM COS upload failed, falling back to local:', err);
      const localPath = path.join(LOCAL_UPLOAD_DIR, filename);
      fs.mkdirSync(path.dirname(localPath), { recursive: true });
      fs.writeFileSync(localPath, fileBuffer);
      return `/uploads/${filename}`;
    }
  },

  async delete(fileUrl: string): Promise<void> {
    if (!config.IBM_COS_API_KEY || fileUrl.startsWith('/uploads/')) {
      const localPath = path.join(LOCAL_UPLOAD_DIR, fileUrl.replace('/uploads/', ''));
      if (fs.existsSync(localPath)) fs.unlinkSync(localPath);
      return;
    }
    // IBM COS delete would go here
  },
};
