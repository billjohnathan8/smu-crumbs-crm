package com.itsa.crm.clients_service.logging;

/**
 * Abstraction for publishing audit log entries for client/account activity.
 */
public interface ClientAuditLogger {
	/**
	 * Publishes a structured audit event.
	 *
	 * @param action audit action (CREATE/UPDATE/DELETE/READ)
	 * @param attributeName attribute being changed or observed
	 * @param beforeValue previous value (nullable)
	 * @param afterValue new value (nullable)
	 * @param agentId authenticated agent id
	 * @param clientId associated client id
	 * @param correlationId request correlation id
	 * @param authorizationHeader bearer token used for downstream auth
	 */
	void logAuditEvent(
		String action,
		String attributeName,
		String beforeValue,
		String afterValue,
		String agentId,
		String clientId,
		String correlationId,
		String authorizationHeader
	);
}
