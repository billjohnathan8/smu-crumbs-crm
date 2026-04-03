CREATE TEMP TABLE _aml_alert_id_remap_v4 AS
SELECT
    id,
    alert_id AS old_alert_id,
    'aml_' || id::text AS new_alert_id
FROM aml_alerts;

UPDATE aml_alerts a
SET alert_id = r.new_alert_id
FROM _aml_alert_id_remap_v4 r
WHERE a.id = r.id
  AND r.new_alert_id <> r.old_alert_id;

UPDATE audit_logs l
SET
    correlation_id = r.new_alert_id,
    after_value = CASE
        WHEN l.after_value IS NOT NULL
             AND l.after_value LIKE '%"alertId"%'
             AND l.after_value LIKE '%' || r.old_alert_id || '%'
            THEN replace(l.after_value, r.old_alert_id, r.new_alert_id)
        ELSE l.after_value
    END,
    updated_at = NOW()
FROM _aml_alert_id_remap_v4 r
WHERE r.new_alert_id <> r.old_alert_id
  AND (
      l.correlation_id = r.old_alert_id
      OR (
          l.after_value IS NOT NULL
          AND l.after_value LIKE '%"alertId"%'
          AND l.after_value LIKE '%' || r.old_alert_id || '%'
      )
  );
