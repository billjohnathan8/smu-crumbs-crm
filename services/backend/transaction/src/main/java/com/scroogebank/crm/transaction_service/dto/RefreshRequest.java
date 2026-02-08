package com.scroogebank.crm.transaction_service.dto;

import jakarta.validation.constraints.NotBlank;

/**
 * Request payload for refreshing an access token.
 */
public record RefreshRequest(
	@NotBlank
	String refreshToken
) {}



