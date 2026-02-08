package com.scroogebank.crm.agentservice.api;

/**
 * Standard API error payload returned by the agent-service.
 *
 * @param error machine-readable error code
 * @param message human-readable error summary
 * @param requestId correlation identifier for the request (if available)
 */
public record ErrorResponse(
	String error,
	String message,
	String requestId
) {}
