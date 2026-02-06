package com.itsa.crm.transactions_service.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Size;

/**
 * Request payload for updating user profile fields.
 */
public record UpdateUserRequest(
	@Size(min = 2, max = 50)
	String firstName,

	@Size(min = 2, max = 50)
	String lastName,

	@Email
	String email,

	UserRole role
) {}


