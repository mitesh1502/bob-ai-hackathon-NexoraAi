import { Router } from 'express';
import { z } from 'zod';
import { authService } from '../services/authService';
import { authenticate } from '../middleware/auth';
import { auditService } from '../services/auditService';

export const authRouter = Router();

const loginSchema = z.object({
  identifier: z.string().min(1),
  password: z.string().min(1),
  totpCode: z.string().optional(),
});

const passwordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).regex(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/,
    'Password must contain uppercase, lowercase, number, and special character'
  ),
});

authRouter.post('/login', async (req, res) => {
  const payload = loginSchema.parse(req.body);
  const result = await authService.login(
    payload,
    req.ip ?? req.socket.remoteAddress
  );
  res.json({ success: true, data: result });
});

authRouter.post('/logout', authenticate, async (req, res) => {
  await auditService.log({
    actorType: req.user!.role === 'worker' ? 'worker' : 'user',
    actorId: req.user!.id,
    action: 'logout',
    ipAddress: req.ip,
  });
  res.json({ success: true, message: 'Logged out' });
});

authRouter.post('/2fa/setup', authenticate, async (req, res) => {
  const result = await authService.setupTotp(req.user!.id, req.user!.role);
  res.json({ success: true, data: { otpauthUrl: result.otpauthUrl, qrCode: result.qrCodeDataUrl } });
});

authRouter.post('/2fa/confirm', authenticate, async (req, res) => {
  const { code } = z.object({ code: z.string().length(6) }).parse(req.body);
  await authService.confirmTotp(req.user!.id, req.user!.role, code);
  res.json({ success: true, message: '2FA enabled' });
});

authRouter.post('/change-password', authenticate, async (req, res) => {
  const { newPassword } = passwordSchema.parse(req.body);
  await authService.resetPassword(req.user!.id, req.user!.role, newPassword);
  await auditService.log({
    actorType: req.user!.role === 'worker' ? 'worker' : 'user',
    actorId: req.user!.id,
    action: 'password_changed',
    ipAddress: req.ip,
  });
  res.json({ success: true, message: 'Password changed' });
});

authRouter.get('/me', authenticate, async (req, res) => {
  res.json({ success: true, data: req.user });
});
