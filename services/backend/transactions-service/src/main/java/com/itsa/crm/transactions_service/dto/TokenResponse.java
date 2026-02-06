package com.itsa.crm.transactions_service.dto;

public record TokenResponse(
	String accessToken,
	String refreshToken,
	long expiresIn,
	String tokenType
) {}


