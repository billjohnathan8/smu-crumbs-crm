package com.scroogebank.crm.user_service.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Payload for performing a password reset using a token.
 *
 * @param token password reset token
 * @param newPassword new password
 * @param confirmPassword password confirmation
 */
public record PerformResetPasswordRequest(
	@NotBlank
	String token,

	@NotBlank
	@Size(min = 8, max = 128)
	String newPassword,

	@NotBlank
	String confirmPassword
) {}
