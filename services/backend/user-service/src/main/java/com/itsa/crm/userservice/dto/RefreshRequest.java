package com.itsa.crm.userservice.dto;

import jakarta.validation.constraints.NotBlank;

/**
 * Refresh token payload for token rotation.
 *
 * @param refreshToken refresh token to exchange
 */
public record RefreshRequest(
	@NotBlank
	String refreshToken
) {}
