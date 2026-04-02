package com.scroogebank.crm.user_service.logging;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.time.Instant;

/**
 * Request payload for posting audit events to the log service.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record LogEventRequest(
	String action,
	String attributeName,
	String beforeValue,
	String afterValue,
	String userId,
	String clientId,
	Instant dateTime,
	String correlationId
) {}
