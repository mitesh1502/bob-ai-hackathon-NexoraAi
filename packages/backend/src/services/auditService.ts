import { query } from '../database/db';

interface AuditEntry {
  actorType: 'user' | 'worker' | 'system';
  actorId?: string;
  actorEmail?: string;
  action: string;
  entityType?: string;
  entityId?: string;
  stateId?: string;
  oldValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

export const auditService = {
  async log(entry: AuditEntry): Promise<void> {
    await query(
      `INSERT INTO audit_logs
         (actor_type, actor_id, actor_email, action, entity_type, entity_id,
          state_id, old_values, new_values, ip_address, user_agent)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::inet,$11)`,
      [
        entry.actorType,
        entry.actorId ?? null,
        entry.actorEmail ?? null,
        entry.action,
        entry.entityType ?? null,
        entry.entityId ?? null,
        entry.stateId ?? null,
        entry.oldValues ? JSON.stringify(entry.oldValues) : null,
        entry.newValues ? JSON.stringify(entry.newValues) : null,
        entry.ipAddress ?? null,
        entry.userAgent ?? null,
      ]
    );
  },

  async list(filters: {
    actorId?: string;
    entityType?: string;
    entityId?: string;
    stateId?: string;
    page?: number;
    pageSize?: number;
  }) {
    const { actorId, entityType, entityId, stateId, page = 1, pageSize = 50 } = filters;
    const offset = (page - 1) * pageSize;

    const conditions: string[] = [];
    const params: unknown[] = [];
    let p = 1;

    if (actorId) { conditions.push(`actor_id = $${p++}`); params.push(actorId); }
    if (entityType) { conditions.push(`entity_type = $${p++}`); params.push(entityType); }
    if (entityId) { conditions.push(`entity_id = $${p++}`); params.push(entityId); }
    if (stateId) { conditions.push(`state_id = $${p++}`); params.push(stateId); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const rows = await query<any>(
      `SELECT * FROM audit_logs ${where} ORDER BY created_at DESC LIMIT $${p} OFFSET $${p + 1}`,
      [...params, pageSize, offset]
    );

    const total = await query<any>(
      `SELECT COUNT(*) FROM audit_logs ${where}`,
      params
    );

    return {
      data: rows,
      total: parseInt(total[0]?.count ?? '0', 10),
      page,
      pageSize,
      totalPages: Math.ceil(parseInt(total[0]?.count ?? '0', 10) / pageSize),
    };
  },
};
