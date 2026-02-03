package com.itsa.crm.clients_service.logging;

import com.itsa.crm.clients_service.dto.ClientPayload;

public interface ClientAuditLogger {
	void logClientEvent(String action, Long clientId, String agentId, ClientPayload payload);
}