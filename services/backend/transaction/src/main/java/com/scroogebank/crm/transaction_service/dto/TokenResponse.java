package com.scroogebank.crm.transaction_service.dto;

/**
 * Response payload containing access/refresh tokens and expiry metadata.
 */
public record TokenResponse(
	String accessToken,
	String refreshToken,
	long expiresIn,
	String tokenType
) {}



