/**
 * NEXORA AI — Notification Service Adapter
 *
 * Uses real SMTP/Twilio if configured; falls back to console logging.
 * To enable production:
 *   - Email: set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM
 *   - SMS:   set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER
 */

import nodemailer from 'nodemailer';
import { config } from '../config/env';
import { logger } from '../utils/logger';
import { query } from '../database/db';
// NotificationEvent is defined locally to avoid workspace resolution issues at build time
type NotificationEvent =
  // Legacy / inspection events
  | 'worker_application_submitted' | 'worker_application_approved' | 'worker_application_rejected'
  | 'worker_assigned' | 'inspection_task_created' | 'report_submitted'
  | 'report_correction_requested' | 'complaint_submitted' | 'complaint_status_changed'
  | 'critical_asset_alert' | 'maintenance_recommended' | 'crew_prepositioning_recommended'
  | 'admin_approval_pending'
  // Alert module events
  | 'alert_created'
  | 'alert_assigned_to_worker'
  | 'alert_accepted_by_worker'
  | 'alert_declined_by_worker'
  | 'alert_worker_travel_started'
  | 'alert_worker_arrived'
  | 'alert_report_submitted'
  | 'alert_report_approved'
  | 'alert_correction_requested'
  | 'alert_escalated'
  | 'alert_critical_risk'
  | 'alert_overdue_report'
  | 'alert_worker_unavailable'
  | 'alert_corrective_approved'
  | 'alert_followup_required'
  | 'alert_closed'
  | 'alert_safety_concern'
  | 'alert_location_inaccessible';
import { v4 as uuidv4 } from 'uuid';

interface NotificationPayload {
  event: NotificationEvent;
  recipientType: 'user' | 'worker' | 'citizen';
  recipientId?: string;
  recipientEmail?: string;
  recipientMobile?: string;
  variables?: Record<string, string>;
}

// ── Email transport ───────────────────────────────────────────
function createEmailTransport() {
  if (!config.SMTP_HOST) return null;
  return nodemailer.createTransport({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure: config.SMTP_PORT === 465,
    auth: { user: config.SMTP_USER, pass: config.SMTP_PASS },
  });
}

function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? '');
}

async function sendEmail(
  to: string,
  subject: string,
  bodyText: string,
  bodyHtml?: string
): Promise<void> {
  const transport = createEmailTransport();
  if (!transport) {
    logger.info(`[Email MOCK] To: ${to} | Subject: ${subject}\n${bodyText}`);
    return;
  }
  await transport.sendMail({
    from: config.EMAIL_FROM,
    to,
    subject,
    text: bodyText,
    html: bodyHtml,
  });
  logger.info(`[Email] Sent to ${to}: ${subject}`);
}

async function sendSms(to: string, body: string): Promise<void> {
  if (!config.TWILIO_ACCOUNT_SID) {
    logger.info(`[SMS MOCK] To: ${to}\n${body}`);
    return;
  }
  // Dynamically import twilio only if configured (optional dependency)
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const twilio: any = await import('twilio' as any).catch(() => null);
  if (!twilio) {
    logger.warn('[SMS] twilio package not installed — logging to console');
    logger.info(`[SMS FALLBACK] To: ${to}\n${body}`);
    return;
  }
  const client = twilio.default(config.TWILIO_ACCOUNT_SID, config.TWILIO_AUTH_TOKEN);
  await client.messages.create({
    body,
    from: config.TWILIO_FROM_NUMBER!,
    to,
  });
  logger.info(`[SMS] Sent to ${to}`);
}

export const notificationService = {
  async send(payload: NotificationPayload): Promise<void> {
    // Load template
    const templates = await query<any>(
      `SELECT * FROM notification_templates WHERE event_key = $1 AND is_active = TRUE`,
      [payload.event]
    );
    const template = templates[0];
    const vars = payload.variables ?? {};

    const subject = template ? interpolate(template.subject ?? '', vars) : payload.event;
    const bodyText = template ? interpolate(template.body_text, vars) : JSON.stringify(vars);
    const bodyHtml = template?.body_html ? interpolate(template.body_html, vars) : undefined;

    const promises: Promise<void>[] = [];

    if (payload.recipientEmail) {
      promises.push(sendEmail(payload.recipientEmail, subject, bodyText, bodyHtml));
    }
    if (payload.recipientMobile) {
      promises.push(sendSms(payload.recipientMobile, bodyText.slice(0, 160)));
    }

    await Promise.allSettled(promises);

    // Record in DB
    await query(
      `INSERT INTO notifications
         (id, event_key, recipient_type, recipient_id, recipient_email,
          recipient_mobile, channel, subject, body, status, sent_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'sent',NOW())`,
      [
        uuidv4(),
        payload.event,
        payload.recipientType,
        payload.recipientId ?? null,
        payload.recipientEmail ?? null,
        payload.recipientMobile ?? null,
        payload.recipientEmail ? 'email' : 'sms',
        subject,
        bodyText,
      ]
    );
  },
};

// ── Alert-specific notification helper ────────────────────────
// Sends via notificationService.send AND records delivery in alert_notifications table

interface AlertNotificationPayload {
  alertId: string;
  event: NotificationEvent;
  recipientType: 'state_admin' | 'worker' | 'operator';
  recipientId?: string;
  recipientEmail?: string;
  recipientMobile?: string;
  variables?: Record<string, string>;
}

export async function sendAlertNotification(
  payload: AlertNotificationPayload
): Promise<void> {
  // Delegate to base notificationService for template lookup + delivery
  try {
    await notificationService.send({
      event: payload.event,
      recipientType:
        payload.recipientType === 'state_admin' || payload.recipientType === 'operator'
          ? 'user'
          : payload.recipientType,
      recipientId: payload.recipientId,
      recipientEmail: payload.recipientEmail,
      recipientMobile: payload.recipientMobile,
      variables: payload.variables,
    });
  } catch (err) {
    logger.error(`[AlertNotification] send error for event ${payload.event}:`, err);
  }

  // Always record delivery in alert_notifications (even if send fails, for audit)
  const templates = await query<any>(
    `SELECT subject, body_text, channel FROM notification_templates
     WHERE event_key = $1 AND is_active = TRUE LIMIT 1`,
    [payload.event]
  );
  const tmpl = templates[0];
  const vars = payload.variables ?? {};
  const subject = tmpl ? interpolate(tmpl.subject ?? '', vars) : payload.event;
  const body = tmpl ? interpolate(tmpl.body_text, vars) : JSON.stringify(vars);

  const channel = payload.recipientEmail ? 'email' : payload.recipientMobile ? 'sms' : 'in_app';

  await query(
    `INSERT INTO alert_notifications
       (id, alert_id, event_key, recipient_type, recipient_id,
        recipient_email, recipient_mobile, channel, subject, body,
        delivery_status, sent_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'sent',NOW())`,
    [
      uuidv4(),
      payload.alertId,
      payload.event,
      payload.recipientType,
      payload.recipientId ?? null,
      payload.recipientEmail ?? null,
      payload.recipientMobile ?? null,
      channel,
      subject,
      body,
    ]
  ).catch((err) => {
    logger.error('[AlertNotification] DB record error:', err);
  });
}
