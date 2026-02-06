package com.itsa.crm.userservice.api;

public record ErrorResponse(
	String error,
	String message,
	String requestId
) {}

