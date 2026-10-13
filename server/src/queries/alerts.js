import { query } from '../db.js';

// A user's alerts, each with the event it is about. Alerts are created by the
// trg_event_alert trigger; the API only reads them and marks them read.
export async function getAlerts(userId, unreadOnly) {
  const { rows } = await query(
    `SELECT a.alert_id, a.created_at, a.read_at,
            e.event_id, e.symbol, e.company_name, e.event_date,
            e.price_change_pct, e.direction, e.severity, e.explanation
     FROM alert a
     JOIN v_event_summary e USING (event_id)
     WHERE a.user_id = $1
       AND (NOT $2::boolean OR a.read_at IS NULL)
     ORDER BY e.event_date DESC, a.alert_id DESC`,
    [userId, unreadOnly],
  );
  return rows;
}

// Marks one of the user's alerts as read. Returns nothing if the alert does not
// exist or belongs to someone else. An already-read alert keeps its first time.
export async function markAlertRead(userId, alertId) {
  const { rows } = await query(
    `UPDATE alert SET read_at = COALESCE(read_at, now())
     WHERE alert_id = $2 AND user_id = $1
     RETURNING alert_id, read_at`,
    [userId, alertId],
  );
  return rows[0];
}
