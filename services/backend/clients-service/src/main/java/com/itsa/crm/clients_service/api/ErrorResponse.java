package com.itsa.crm.clients_service.api;

public record ErrorResponse(
	String error,
	String message,
	String requestId
) {}

