package com.scroogebank.crm.agentservice.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * Payload for creating a new user account.
 *
 * @param firstName user's first name
 * @param lastName user's last name
 * @param email user's email address
 * @param role optional role (defaults to agent when omitted)
 * @param sendInviteEmail whether to send an invite email
 * @param temporaryPassword optional temporary password
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

	@Size(min = 8, max = 128)
	String temporaryPassword
) {}
