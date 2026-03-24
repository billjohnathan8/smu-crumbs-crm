package com.scroogebank.crm.userservice.api;

/**
 * Standard API error payload returned by the user-service.
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
