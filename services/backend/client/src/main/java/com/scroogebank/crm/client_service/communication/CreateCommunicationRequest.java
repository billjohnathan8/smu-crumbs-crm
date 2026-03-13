package com.scroogebank.crm.client_service.communication;

/**
 * Request payload for creating a communication in the log service.
 */
public record CreateCommunicationRequest(
	String clientId,
	String agentId,
	String toEmail,
	String subject,
	String body,
	String channel,
	String idempotencyKey
) {}
