package com.scroogebank.crm.transaction_service.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * Request payload for creating a new user account.
 */
public record CreateUserRequest(
	@NotBlank
	@Size(min = 2, max = 50)
	String firstName,

	@NotBlank
	@Size(min = 2, max = 50)
	String lastName,

	@NotBlank
	@Email
	String email,

	@NotNull
	UserRole role,

	Boolean sendInviteEmail,

	String temporaryPassword
) {}


