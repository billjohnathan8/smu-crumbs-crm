package com.itsa.crm.agentservice.dto;

import jakarta.validation.constraints.Email;

/**
 * Payload for requesting a password reset.
 *
 * @param email user email address
 */
public record ResetPasswordRequest(
	@Email
	String email
) {}
