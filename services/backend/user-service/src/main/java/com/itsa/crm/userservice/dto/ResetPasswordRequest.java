package com.itsa.crm.userservice.dto;

import jakarta.validation.constraints.Email;

public record ResetPasswordRequest(
	@Email
	String email
) {}

