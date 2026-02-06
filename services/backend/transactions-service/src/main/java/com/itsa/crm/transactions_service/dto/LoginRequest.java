package com.itsa.crm.transactions_service.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;

/**
 * Request payload for user login.
 */
public record LoginRequest(
	@NotBlank
	@Email
	String email,

	@NotBlank
	String password
) {}


