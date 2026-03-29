package com.scroogebank.crm.client_service.communication;

import java.time.Instant;

/**
 * Patch payload for communication delivery status updates in the log service.
 */
public record UpdateCommunicationStatusRequest(
	CommunicationStatus status,
	String providerMessageId,
	String errorMessage,
	Integer retryCount,
	Instant nextAttemptAt,
	Instant lastAttemptAt,
	String deliveryEvent
) {}
