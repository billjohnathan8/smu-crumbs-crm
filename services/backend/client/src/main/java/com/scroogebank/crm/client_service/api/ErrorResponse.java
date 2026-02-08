package com.scroogebank.crm.client_service.api;

/**
 * Standard error payload returned by API exception handlers.
 */
public record ErrorResponse(
	String error,
	String message,
	String requestId
) {}
