package com.scroogebank.crm.userservice.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Login credentials submitted by a user.
 *
 * @param email user's email address
 * @param password user's password
 */
public record LoginRequest(
	@NotBlank
	@Email
	String email,

	@NotBlank
	@Size(min = 8, max = 128)
	String password
) {}
