import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import { query } from '../database/db';
import { config } from '../config/env';
import { AppError } from '../middleware/errorHandler';
import { auditService } from './auditService';

export interface LoginPayload {
  identifier: string; // email, username, employee_id, or mobile
  password: string;
  totpCode?: string;
}

export interface AuthResult {
  token: string;
  user: {
    id: string;
    role: string;
    fullName: string;
    email: string;
    stateId?: string;
    is2faEnabled: boolean;
    requires2fa?: boolean;
  };
}

export const authService = {
  async login(payload: LoginPayload, ipAddress?: string): Promise<AuthResult> {
    const { identifier, password, totpCode } = payload;

    // Try users table first (admins)
    const users = await query<any>(
      `SELECT id, email, username, mobile, password_hash, role, state_id,
              full_name, is_active, is_2fa_enabled, totp_secret,
              failed_login_count, locked_until
       FROM users
       WHERE (email = $1 OR username = $1 OR mobile = $1)
         AND is_active = TRUE`,
      [identifier]
    );

    // Try worker_profiles
    const workers = await query<any>(
      `SELECT id, email, username, mobile, password_hash,
              'worker' AS role, state_id, full_name,
              is_active, is_2fa_enabled, totp_secret,
              0 AS failed_login_count, NULL AS locked_until
       FROM worker_profiles
       WHERE (email = $1 OR username = $1 OR mobile = $1 OR application_number = $1)
         AND is_active = TRUE AND status = 'employed'`,
      [identifier]
    );

    const record = users[0] ?? workers[0];
    if (!record) {
      throw new AppError(401, 'Invalid credentials');
    }

    // Check lock
    if (record.locked_until && new Date(record.locked_until) > new Date()) {
      throw new AppError(429, 'Account temporarily locked due to too many failed attempts');
    }

    // Verify password
    if (!record.password_hash) {
      throw new AppError(401, 'Account not configured for login');
    }
    const valid = await bcrypt.compare(password, record.password_hash);
    if (!valid) {
      // Increment failed count
      const table = record.role === 'worker' ? 'worker_profiles' : 'users';
      const newCount = (record.failed_login_count || 0) + 1;
      const lockUntil = newCount >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null;
      await query(
        `UPDATE ${table} SET failed_login_count = $1, locked_until = $2 WHERE id = $3`,
        [newCount, lockUntil, record.id]
      );
      throw new AppError(401, 'Invalid credentials');
    }

    // Reset failed count
    const table = record.role === 'worker' ? 'worker_profiles' : 'users';
    await query(
      `UPDATE ${table} SET failed_login_count = 0, locked_until = NULL, last_login_at = NOW() WHERE id = $1`,
      [record.id]
    );

    // 2FA check
    if (record.is_2fa_enabled) {
      if (!totpCode) {
        // Signal client to show TOTP input
        return {
          token: '',
          user: {
            id: record.id,
            role: record.role,
            fullName: record.full_name,
            email: record.email,
            stateId: record.state_id,
            is2faEnabled: true,
            requires2fa: true,
          },
        };
      }
      const verified = speakeasy.totp.verify({
        secret: record.totp_secret,
        encoding: 'base32',
        token: totpCode,
        window: 1,
      });
      if (!verified) throw new AppError(401, 'Invalid 2FA code');
    }

    const tokenPayload = {
      id: record.id,
      role: record.role,
      stateId: record.state_id ?? undefined,
      email: record.email,
    };

    const token = jwt.sign(tokenPayload, config.JWT_SECRET, {
      expiresIn: config.JWT_EXPIRY as any,
    });

    await auditService.log({
      actorType: record.role === 'worker' ? 'worker' : 'user',
      actorId: record.id,
      actorEmail: record.email,
      action: 'login',
      ipAddress,
    });

    return {
      token,
      user: {
        id: record.id,
        role: record.role,
        fullName: record.full_name,
        email: record.email,
        stateId: record.state_id,
        is2faEnabled: record.is_2fa_enabled,
      },
    };
  },

  async setupTotp(
    userId: string,
    role: string
  ): Promise<{ otpauthUrl: string; qrCodeDataUrl: string; secret: string }> {
    const secret = speakeasy.generateSecret({
      name: `${config.TOTP_ISSUER}`,
      length: 20,
    });
    const table = role === 'worker' ? 'worker_profiles' : 'users';
    await query(`UPDATE ${table} SET totp_secret = $1 WHERE id = $2`, [
      secret.base32,
      userId,
    ]);
    const qrCodeDataUrl = await QRCode.toDataURL(secret.otpauth_url!);
    return { otpauthUrl: secret.otpauth_url!, qrCodeDataUrl, secret: secret.base32 };
  },

  async confirmTotp(userId: string, role: string, code: string): Promise<void> {
    const table = role === 'worker' ? 'worker_profiles' : 'users';
    const rows = await query<any>(
      `SELECT totp_secret FROM ${table} WHERE id = $1`,
      [userId]
    );
    if (!rows[0]?.totp_secret) throw new AppError(400, 'TOTP not set up');
    const valid = speakeasy.totp.verify({
      secret: rows[0].totp_secret,
      encoding: 'base32',
      token: code,
      window: 1,
    });
    if (!valid) throw new AppError(400, 'Invalid TOTP code');
    await query(`UPDATE ${table} SET is_2fa_enabled = TRUE WHERE id = $1`, [userId]);
  },

  async resetPassword(
    userId: string,
    role: string,
    newPassword: string
  ): Promise<void> {
    const table = role === 'worker' ? 'worker_profiles' : 'users';
    const hash = await bcrypt.hash(newPassword, config.BCRYPT_ROUNDS);
    await query(`UPDATE ${table} SET password_hash = $1 WHERE id = $2`, [hash, userId]);
  },

  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, config.BCRYPT_ROUNDS);
  },
};
