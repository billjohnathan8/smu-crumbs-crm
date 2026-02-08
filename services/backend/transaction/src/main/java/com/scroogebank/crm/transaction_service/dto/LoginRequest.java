package com.scroogebank.crm.transaction_service.dto;

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



