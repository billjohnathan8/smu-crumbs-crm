package com.scroogebank.crm.user_service.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Size;

/**
 * Partial update payload for user profiles.
 *
 * @param firstName updated first name
 * @param lastName updated last name
 * @param email updated email address
 * @param role updated role
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
