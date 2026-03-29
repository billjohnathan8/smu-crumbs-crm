package com.scroogebank.crm.transaction_service.logging;

/**
 * Abstraction for publishing transaction audit events.
 */
public interface TransactionAuditLogger {
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

