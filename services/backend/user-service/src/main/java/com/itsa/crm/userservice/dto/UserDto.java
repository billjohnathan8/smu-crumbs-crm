package com.itsa.crm.userservice.dto;

import java.time.Instant;

/**
 * User profile representation returned by the API.
 *
 * @param id API user identifier
 * @param firstName user's first name
 * @param lastName user's last name
 * @param email user's email address
 * @param role user's role
 * @param status user's status
 * @param createdAt creation timestamp
 * @param updatedAt last update timestamp
 */
public record UserDto(
	String id,
	String firstName,
	String lastName,
	String email,
	UserRole role,
	UserStatus status,
	Instant createdAt,
	Instant updatedAt
) {}
