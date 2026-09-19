import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requireRole } from '../middleware/auth';
import { query } from '../database/db';
import { auditService } from '../services/auditService';

export const settingsRouter = Router();

// ── Get site settings (public) ────────────────────────────────
settingsRouter.get('/', async (_req, res) => {
  const rows = await query<any>(`SELECT * FROM website_settings LIMIT 1`);
  const settings = rows[0] ?? {};
  // Don't expose internal fields
  res.json({
    success: true,
    data: {
      siteName: settings.site_name,
      logoUrl: settings.logo_url,
      faviconUrl: settings.favicon_url,
      backgroundImageUrl: settings.background_image_url,
      loginBgUrl: settings.login_bg_url,
      primaryColor: settings.primary_color,
      secondaryColor: settings.secondary_color,
      accentColor: settings.accent_color,
      dashboardTitle: settings.dashboard_title,
      footerText: settings.footer_text,
    },
  });
});

// ── Update site settings (super admin) ────────────────────────
settingsRouter.put('/', authenticate, requireRole('super_admin'), async (req, res) => {
  const data = z.object({
    siteName: z.string().optional(),
    logoUrl: z.string().url().optional(),
    faviconUrl: z.string().url().optional(),
    backgroundImageUrl: z.string().url().optional(),
    loginBgUrl: z.string().url().optional(),
    primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    secondaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    dashboardTitle: z.string().optional(),
    footerText: z.string().optional(),
  }).parse(req.body);

  const existing = await query<any>(`SELECT id FROM website_settings LIMIT 1`);

  if (existing.length === 0) {
    await query(`INSERT INTO website_settings DEFAULT VALUES`);
  }

  await query(
    `UPDATE website_settings SET
       site_name = COALESCE($1, site_name),
       logo_url = COALESCE($2, logo_url),
       favicon_url = COALESCE($3, favicon_url),
       background_image_url = COALESCE($4, background_image_url),
       login_bg_url = COALESCE($5, login_bg_url),
       primary_color = COALESCE($6, primary_color),
       secondary_color = COALESCE($7, secondary_color),
       accent_color = COALESCE($8, accent_color),
       dashboard_title = COALESCE($9, dashboard_title),
       footer_text = COALESCE($10, footer_text),
       updated_by = $11, updated_at = NOW()`,
    [
      data.siteName ?? null, data.logoUrl ?? null, data.faviconUrl ?? null,
      data.backgroundImageUrl ?? null, data.loginBgUrl ?? null,
      data.primaryColor ?? null, data.secondaryColor ?? null,
      data.accentColor ?? null, data.dashboardTitle ?? null,
      data.footerText ?? null, req.user!.id,
    ]
  );

  await auditService.log({
    actorType: 'user',
    actorId: req.user!.id,
    action: 'website_settings_updated',
    entityType: 'website_settings',
  });

  res.json({ success: true, message: 'Settings updated' });
});
