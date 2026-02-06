package com.itsa.crm.transactions_service.dto;

import jakarta.validation.constraints.Email;

public record ResetPasswordRequest(
	@Email
	String email
) {}


