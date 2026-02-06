package com.itsa.crm.transactions_service.api;

public record ErrorResponse(
	String error,
	String message,
	String requestId
) {}


