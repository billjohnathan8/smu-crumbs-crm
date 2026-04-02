package com.scroogebank.crm.user_service.logging;

/**
 * Abstraction for publishing audit log entries for user account activity.
 */
public interface UserAuditLogger {
	/**
	 * Publishes a structured audit event.
	 *
	 * @param action audit action (CREATE/UPDATE/DELETE)
	 * @param attributeName attribute being changed or observed
	 * @param beforeValue previous value (nullable)
	 * @param afterValue new value (nullable)
	 * @param userId authenticated user id performing the action
	 * @param clientId target user id (subject of the action)
	 * @param correlationId request correlation id
	 * @param authorizationHeader bearer token used for downstream auth
	 */
	void logAuditEvent(
		String action,
		String attributeName,
		String beforeValue,
		String afterValue,
		String userId,
		String clientId,
		String correlationId,
		String authorizationHeader
	);
}
