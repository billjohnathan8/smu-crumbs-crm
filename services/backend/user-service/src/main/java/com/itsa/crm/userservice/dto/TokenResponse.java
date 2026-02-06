package com.itsa.crm.userservice.dto;

public record TokenResponse(
	String accessToken,
	String refreshToken,
	long expiresIn,
	String tokenType
) {}

