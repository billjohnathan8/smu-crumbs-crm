package com.scroogebank.crm.user_service.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
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
	Instant updatedAt,
	Instant archivedAt,
	String archivedBy,
	String archivalReason,
	Instant reinstatedAt,
	String reinstatedBy
) {
	private static final String ROOT_ADMIN_USER_ID = "usr_1";

	public UserDto(
		String id,
		String firstName,
		String lastName,
		String email,
		UserRole role,
		UserStatus status,
		Instant createdAt,
		Instant updatedAt
	) {
		this(id, firstName, lastName, email, role, status, createdAt, updatedAt, null, null, null, null, null);
	}

	/**
	 * Explicit backend-owned root-admin claim for frontend authorization.
	 */
	@JsonProperty("isRootAdmin")
	public boolean isRootAdmin() {
		return ROOT_ADMIN_USER_ID.equals(id);
	}
}
