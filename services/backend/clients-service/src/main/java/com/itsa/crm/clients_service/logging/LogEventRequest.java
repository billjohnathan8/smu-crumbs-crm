package com.itsa.crm.clients_service.logging;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.time.Instant;
import java.util.Map;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record LogEventRequest(
	String source,
	String action,
	String entityType,
	Long entityId,
	String agentId,
	String message,
	Map<String, Object> payload,
	Instant occurredAt
) {}