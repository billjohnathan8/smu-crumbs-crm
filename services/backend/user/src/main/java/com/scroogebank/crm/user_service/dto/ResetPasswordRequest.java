package com.scroogebank.crm.user_service.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;

/**
 * Payload for requesting a password reset.
 *
 * @param email user email address
 */
public record ResetPasswordRequest(
	@NotBlank
	@Email
	String email
) {}
