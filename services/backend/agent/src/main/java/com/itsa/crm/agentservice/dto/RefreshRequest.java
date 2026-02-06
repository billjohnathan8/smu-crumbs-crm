package com.itsa.crm.agentservice.dto;

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
