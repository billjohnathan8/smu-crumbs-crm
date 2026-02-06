package com.itsa.crm.clients_service.logging;

public interface ClientAuditLogger {
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
