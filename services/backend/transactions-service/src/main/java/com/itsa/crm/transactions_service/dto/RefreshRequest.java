package com.itsa.crm.transactions_service.dto;

import jakarta.validation.constraints.NotBlank;

/**
 * Request payload for refreshing an access token.
 */
public record RefreshRequest(
	@NotBlank
	String refreshToken
) {}


