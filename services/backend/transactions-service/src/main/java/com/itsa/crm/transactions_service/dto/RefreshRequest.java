package com.itsa.crm.transactions_service.dto;

import jakarta.validation.constraints.NotBlank;

public record RefreshRequest(
	@NotBlank
	String refreshToken
) {}


