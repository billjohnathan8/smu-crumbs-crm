package com.itsa.crm.userservice.dto;

import java.time.Instant;

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
