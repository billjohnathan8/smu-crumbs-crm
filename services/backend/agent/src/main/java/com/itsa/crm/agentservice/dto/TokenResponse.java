package com.itsa.crm.agentservice.dto;

/**
 * Token payload returned after successful authentication or refresh.
 *
 * @param accessToken JWT access token
 * @param refreshToken refresh token to rotate
 * @param expiresIn access token lifetime in seconds
 * @param tokenType token type (e.g. Bearer)
 */
public record TokenResponse(
	String accessToken,
	String refreshToken,
	long expiresIn,
	String tokenType
) {}
