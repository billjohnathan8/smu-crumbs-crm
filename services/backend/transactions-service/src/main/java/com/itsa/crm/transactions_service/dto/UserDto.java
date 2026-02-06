package com.itsa.crm.transactions_service.dto;

import java.time.Instant;

/**
 * DTO describing a user account.
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

