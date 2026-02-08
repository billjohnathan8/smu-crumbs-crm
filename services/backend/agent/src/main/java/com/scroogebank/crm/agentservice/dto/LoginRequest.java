package com.scroogebank.crm.agentservice.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;

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
	String password
) {}
