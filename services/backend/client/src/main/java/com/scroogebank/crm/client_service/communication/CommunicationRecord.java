package com.scroogebank.crm.client_service.communication;

import java.time.Instant;

/**
 * Communication representation returned by log service APIs.
 */
public record CommunicationRecord(
	String communicationId,
	String clientId,
	String userId,
	String channel,
	String toEmail,
	String subject,
	String body,
	CommunicationStatus status,
	String providerMessageId,
	String errorMessage,
	String idempotencyKey,
	Integer retryCount,
	Instant nextAttemptAt,
	Instant lastAttemptAt,
	String deliveryEvent,
	Instant createdAt,
	Instant updatedAt
) {}
