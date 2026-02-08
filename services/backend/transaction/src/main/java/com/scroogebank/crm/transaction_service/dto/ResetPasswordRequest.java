package com.scroogebank.crm.transaction_service.dto;

import jakarta.validation.constraints.Email;

/**
 * Request payload to initiate a password reset.
 */
public record ResetPasswordRequest(
	@Email
	String email
) {}



