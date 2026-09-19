/**
 * NEXORA AI — IBM Bob / watsonx.ai Triage Service
 *
 * Sends alert context to ibm/granite-13b-chat-v2 via the watsonx.ai REST API.
 * Returns a structured triage result:
 *   - summary: plain-English description of the situation
 *   - recommended_action: concrete next step
 *   - urgency_level: 'low' | 'moderate' | 'high' | 'critical'
 *   - risk_score: current numeric risk
 *   - powered_by: 'watsonx.ai granite-13b-chat-v2' | 'rule-based-fallback'
 *
 * GRACEFUL FALLBACK:
 * If WATSONX_API_KEY / WATSONX_URL / WATSONX_PROJECT_ID are not configured,
 * the rule-based summarizer runs instead and returns the same JSON shape,
 * so the frontend always gets a valid response.
 */

import { query } from '../database/db';
import { config } from '../config/env';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';
import * as crypto from 'crypto';

// ── Types ─────────────────────────────────────────────────────

export interface BobTriageResult {
  triage_id: string;
  alert_id: string;
  summary: string;
  recommended_action: string;
  urgency_level: 'low' | 'moderate' | 'high' | 'critical';
  risk_score: number;
  powered_by: 'watsonx.ai granite-13b-chat-v2' | 'rule-based-fallback';
  cached: boolean;
  created_at: string;
}

// ── Main entry point ──────────────────────────────────────────

export async function triageAlert(alertId: string): Promise<BobTriageResult> {
  // 1. Load alert context from DB
  const ctx = await loadAlertContext(alertId);

  // 2. Check cache (keyed by alert_id + content hash)
  const contentHash = crypto
    .createHash('sha256')
    .update(JSON.stringify(ctx))
    .digest('hex')
    .slice(0, 16);

  const cached = await query<any>(
    `SELECT * FROM bob_triage_cache
     WHERE alert_id = $1 AND content_hash = $2
     ORDER BY created_at DESC LIMIT 1`,
    [alertId, contentHash]
  );

  if (cached.length > 0) {
    const row = cached[0];
    return {
      triage_id: row.id,
      alert_id: alertId,
      summary: row.summary,
      recommended_action: row.recommended_action,
      urgency_level: row.urgency_level,
      risk_score: ctx.risk_score,
      powered_by: row.powered_by,
      cached: true,
      created_at: row.created_at,
    };
  }

  // 3. Call watsonx or fallback
  let result: Omit<BobTriageResult, 'triage_id' | 'alert_id' | 'cached' | 'created_at'>;
  if (config.WATSONX_API_KEY && config.WATSONX_URL && config.WATSONX_PROJECT_ID) {
    result = await callWatsonx(ctx);
  } else {
    logger.info('[BobService] watsonx credentials not configured — using rule-based fallback');
    result = ruleBasedFallback(ctx);
  }

  // 4. Persist to cache
  const triageId = uuidv4();
  const now = new Date().toISOString();
  await query(
    `INSERT INTO bob_triage_cache
       (id, alert_id, content_hash, summary, recommended_action,
        urgency_level, powered_by, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT DO NOTHING`,
    [
      triageId, alertId, contentHash,
      result.summary, result.recommended_action,
      result.urgency_level, result.powered_by, now,
    ]
  );

  return {
    triage_id: triageId,
    alert_id: alertId,
    cached: false,
    created_at: now,
    ...result,
  };
}

// ── Load alert context ─────────────────────────────────────────

async function loadAlertContext(alertId: string) {
  // Alert + asset + location
  const alertRes = await query<any>(
    `SELECT
       a.id, a.alert_number, a.title, a.description, a.priority,
       a.status, a.current_risk_score, a.current_risk_level,
       a.asset_type_reported, a.problem_category,
       ast.name AS asset_name, ast.asset_type, ast.installation_year,
       ast.rated_capacity_kva, ast.current_load_kva,
       v.name AS village_name, t.name AS taluka_name,
       d.name AS district_name, s.name AS state_name
     FROM alerts a
     LEFT JOIN assets ast ON ast.id = a.asset_id
     LEFT JOIN villages v ON v.id = a.village_id
     LEFT JOIN talukas t ON t.id = a.taluka_id
     LEFT JOIN districts d ON d.id = a.district_id
     LEFT JOIN states s ON s.id = a.state_id
     WHERE a.id = $1`,
    [alertId]
  );

  const alert = alertRes[0] ?? {};

  // Latest negative findings
  const negRows = await query<any>(
    `SELECT nf.finding_type, nf.severity, nf.description
     FROM negative_findings nf
     JOIN alert_field_reports afr ON afr.id = nf.field_report_id
     WHERE afr.alert_id = $1
     ORDER BY nf.severity DESC LIMIT 10`,
    [alertId]
  );

  // Latest positive findings
  const posRows = await query<any>(
    `SELECT pf.finding_type, pf.description
     FROM positive_findings pf
     JOIN alert_field_reports afr ON afr.id = pf.field_report_id
     WHERE afr.alert_id = $1 LIMIT 10`,
    [alertId]
  );

  // Latest sensor readings
  const sensorRows = await query<any>(
    `SELECT sr.sensor_type, sr.value, sr.unit, sr.is_anomalous, sr.recorded_at
     FROM sensor_readings sr
     JOIN asset_sensors ases ON ases.id = sr.sensor_id
     JOIN assets ast ON ast.id = ases.asset_id
     JOIN alerts al ON al.asset_id = ast.id
     WHERE al.id = $1
     ORDER BY sr.recorded_at DESC LIMIT 10`,
    [alertId]
  );

  // Active weather alerts for district
  const weatherRows = await query<any>(
    `SELECT wr.storm_alert, wr.flood_alert, wr.heatwave_alert,
            wr.lightning_risk, wr.extreme_weather, wr.temperature,
            wr.rainfall_mm, wr.wind_speed_kmh
     FROM weather_records wr
     JOIN alerts al ON al.district_id = wr.district_id
     WHERE al.id = $1
     ORDER BY wr.recorded_at DESC LIMIT 1`,
    [alertId]
  );

  // Recent historical incidents
  const histRows = await query<any>(
    `SELECT hi.incident_type, hi.severity, hi.description, hi.occurred_at
     FROM historical_incidents hi
     JOIN assets ast ON ast.id = hi.asset_id
     JOIN alerts al ON al.asset_id = ast.id
     WHERE al.id = $1
       AND hi.occurred_at > NOW() - INTERVAL '90 days'
     ORDER BY hi.occurred_at DESC LIMIT 5`,
    [alertId]
  );

  return {
    alert_id: alertId,
    alert_number: alert.alert_number ?? alertId,
    title: alert.title ?? 'Unknown alert',
    description: alert.description ?? '',
    priority: alert.priority ?? 'medium',
    status: alert.status ?? 'unknown',
    risk_score: alert.current_risk_score ?? 0,
    risk_level: alert.current_risk_level ?? 'low',
    asset_name: alert.asset_name ?? 'Unknown asset',
    asset_type: alert.asset_type ?? alert.asset_type_reported ?? 'unknown',
    installation_year: alert.installation_year ?? null,
    rated_capacity_kva: alert.rated_capacity_kva ?? null,
    current_load_kva: alert.current_load_kva ?? null,
    location: [alert.village_name, alert.taluka_name, alert.district_name, alert.state_name]
      .filter(Boolean).join(', '),
    negative_findings: negRows,
    positive_findings: posRows,
    sensor_readings: sensorRows,
    weather: weatherRows[0] ?? null,
    historical_incidents: histRows,
  };
}

// ── watsonx.ai API call ────────────────────────────────────────

async function callWatsonx(ctx: any): Promise<Omit<BobTriageResult, 'triage_id' | 'alert_id' | 'cached' | 'created_at'>> {
  const prompt = buildPrompt(ctx);

  // Get IAM access token
  const iamRes = await fetch('https://iam.cloud.ibm.com/identity/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ibm:params:oauth:grant-type:apikey&apikey=${config.WATSONX_API_KEY}`,
  });

  if (!iamRes.ok) {
    throw new Error(`IBM IAM token request failed: ${iamRes.status}`);
  }

  const { access_token } = (await iamRes.json()) as { access_token: string };

  // Call watsonx.ai text generation
  const wxUrl = `${config.WATSONX_URL}/ml/v1/text/chat?version=2024-05-31`;
  const wxRes = await fetch(wxUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${access_token}`,
    },
    body: JSON.stringify({
      model_id: 'ibm/granite-13b-chat-v2',
      project_id: config.WATSONX_PROJECT_ID,
      messages: [
        {
          role: 'system',
          content:
            'You are NEXORA AI, an intelligent power grid alert triage assistant. ' +
            'Analyse the alert context and respond ONLY with valid JSON in this exact shape: ' +
            '{"summary":"...","recommended_action":"...","urgency_level":"low|moderate|high|critical"}. ' +
            'Be concise and factual. Do not add any text outside the JSON.',
        },
        { role: 'user', content: prompt },
      ],
      parameters: {
        max_new_tokens: 400,
        temperature: 0.2,
        top_p: 0.9,
      },
    }),
  });

  if (!wxRes.ok) {
    const body = await wxRes.text();
    throw new Error(`watsonx.ai API error ${wxRes.status}: ${body}`);
  }

  const wxBody = (await wxRes.json()) as any;
  const rawContent: string =
    wxBody?.choices?.[0]?.message?.content ??
    wxBody?.results?.[0]?.generated_text ??
    '';

  // Parse JSON from response
  const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(`watsonx response did not contain JSON: ${rawContent}`);
  }

  const parsed = JSON.parse(jsonMatch[0]) as {
    summary: string;
    recommended_action: string;
    urgency_level: string;
  };

  return {
    summary: parsed.summary,
    recommended_action: parsed.recommended_action,
    urgency_level: normaliseUrgency(parsed.urgency_level),
    risk_score: ctx.risk_score,
    powered_by: 'watsonx.ai granite-13b-chat-v2',
  };
}

// ── Prompt builder ─────────────────────────────────────────────

function buildPrompt(ctx: any): string {
  const lines: string[] = [
    `Alert: ${ctx.alert_number} — ${ctx.title}`,
    `Asset: ${ctx.asset_name} (${ctx.asset_type}) at ${ctx.location}`,
    `Status: ${ctx.status} | Priority: ${ctx.priority} | Risk: ${ctx.risk_score}/100 (${ctx.risk_level})`,
  ];

  if (ctx.installation_year) {
    const age = new Date().getFullYear() - ctx.installation_year;
    lines.push(`Asset age: ${age} years (installed ${ctx.installation_year})`);
  }

  if (ctx.rated_capacity_kva && ctx.current_load_kva) {
    const pct = Math.round((ctx.current_load_kva / ctx.rated_capacity_kva) * 100);
    lines.push(`Load: ${ctx.current_load_kva} kVA / ${ctx.rated_capacity_kva} kVA rated (${pct}%)`);
  }

  if (ctx.negative_findings.length > 0) {
    lines.push('\nNEGATIVE FINDINGS (problems found):');
    for (const f of ctx.negative_findings) {
      lines.push(`  - [${f.severity.toUpperCase()}] ${f.finding_type}: ${f.description ?? ''}`);
    }
  }

  if (ctx.positive_findings.length > 0) {
    lines.push('\nPOSITIVE FINDINGS (conditions OK):');
    for (const f of ctx.positive_findings) {
      lines.push(`  - ${f.finding_type}: ${f.description ?? ''}`);
    }
  }

  if (ctx.sensor_readings.length > 0) {
    lines.push('\nSENSOR READINGS:');
    for (const r of ctx.sensor_readings) {
      const flag = r.is_anomalous ? ' ⚠ ANOMALOUS' : '';
      lines.push(`  - ${r.sensor_type}: ${r.value} ${r.unit}${flag}`);
    }
  }

  if (ctx.weather) {
    const w = ctx.weather;
    const alerts = [
      w.storm_alert && 'storm',
      w.flood_alert && 'flood',
      w.heatwave_alert && 'heatwave',
      w.lightning_risk && 'lightning',
      w.extreme_weather && 'extreme weather',
    ].filter(Boolean);
    lines.push(`\nWEATHER: ${w.temperature}°C, ${w.rainfall_mm}mm rain, ${w.wind_speed_kmh}km/h wind`);
    if (alerts.length > 0) lines.push(`Active weather alerts: ${alerts.join(', ')}`);
  }

  if (ctx.historical_incidents.length > 0) {
    lines.push('\nRECENT INCIDENTS (last 90 days):');
    for (const i of ctx.historical_incidents) {
      lines.push(`  - ${i.incident_type} [${i.severity}]: ${i.description ?? ''}`);
    }
  }

  lines.push(
    '\nBased on all the above, provide a triage summary, recommended action, and urgency level as JSON.'
  );

  return lines.join('\n');
}

// ── Rule-based fallback ────────────────────────────────────────

function ruleBasedFallback(ctx: any): Omit<BobTriageResult, 'triage_id' | 'alert_id' | 'cached' | 'created_at'> {
  const critical = ctx.negative_findings.some(
    (f: any) => f.severity === 'critical'
  );
  const hasCritical = ctx.risk_score >= 75 || critical;
  const hasHigh = ctx.risk_score >= 50 || ctx.negative_findings.some((f: any) => f.severity === 'high');

  const urgency: 'low' | 'moderate' | 'high' | 'critical' = hasCritical
    ? 'critical'
    : hasHigh
    ? 'high'
    : ctx.risk_score >= 30
    ? 'moderate'
    : 'low';

  const negList =
    ctx.negative_findings.length > 0
      ? ctx.negative_findings
          .slice(0, 3)
          .map((f: any) => f.finding_type.replace(/_/g, ' '))
          .join(', ')
      : 'none reported';

  const summary =
    `Alert ${ctx.alert_number} — ${ctx.asset_type} at ${ctx.location}. ` +
    `Current risk score: ${ctx.risk_score}/100 (${ctx.risk_level}). ` +
    `Key issues: ${negList}. ` +
    (ctx.weather?.storm_alert
      ? 'Active storm alert in district compounds risk. '
      : '') +
    (ctx.weather?.flood_alert
      ? 'Active flood alert in district. '
      : '');

  const actionMap: Record<string, string> = {
    critical:
      'Immediate dispatch required. Isolate the asset if safe to do so. ' +
      'Alert the State Admin and escalate to Super Admin if cross-state resources needed.',
    high:
      'Priority dispatch within 2 hours. Perform full inspection on-site. ' +
      'Confirm corrective action plan before leaving.',
    moderate:
      'Schedule inspection within 24 hours. Monitor sensor readings remotely. ' +
      'Notify State Admin of status.',
    low:
      'Add to next scheduled maintenance run. No immediate dispatch required. ' +
      'Continue remote monitoring.',
  };

  return {
    summary,
    recommended_action: actionMap[urgency],
    urgency_level: urgency,
    risk_score: ctx.risk_score,
    powered_by: 'rule-based-fallback',
  };
}

// ── Helpers ────────────────────────────────────────────────────

function normaliseUrgency(raw: string): 'low' | 'moderate' | 'high' | 'critical' {
  const v = (raw ?? '').toLowerCase();
  if (v === 'critical') return 'critical';
  if (v === 'high') return 'high';
  if (v === 'moderate' || v === 'medium') return 'moderate';
  return 'low';
}
