package com.scroogebank.crm.user_service.security;

import java.util.Objects;

import com.scroogebank.crm.user_service.dto.UserRole;

/**
 * Authenticated principal extracted from a verified JWT.
 *
 * @param userId API user identifier
 * @param role role of the authenticated user
 */
public record AuthenticatedUser(
	String userId,
	UserRole role
) {

	public AuthenticatedUser(String userId, UserRole role) {
        this.userId = Objects.requireNonNull(userId, "userId");
        this.role = Objects.requireNonNull(role, "role");
	}

	// Constructor for compatibility with older code using String roles
	public AuthenticatedUser(String userId, String role) {
		this(userId, parseRole(role));
	}

	/**
	 * @return true when the user has the super admin role
	 */
	public boolean isSuperAdmin() {
		return role == UserRole.super_admin;
	}

	/**
	 * @return true when the user has the admin role
	 */
	public boolean isAdmin() {
		return role == UserRole.admin;
	}

	/**
	 * @return true when the user has the user role
	 */
	public boolean isUser() {
		return role == UserRole.user;
	}

	private static UserRole parseRole(String r) {
        if (r == null) throw new IllegalArgumentException("role missing");
        try {
            // support values like "super_admin", "SUPER_ADMIN", "Super_Admin"
            String normalized = r.trim().replace('-', '_').replace(' ', '_').toUpperCase();
            // try direct enum name
            return UserRole.valueOf(normalized);
        } catch (IllegalArgumentException ex) {
            // fallback: try common aliases
            String low = r.trim().toLowerCase();
            return switch (low) {
                case "superadmin", "super_admin", "super-admin" -> UserRole.super_admin;
                case "admin" -> UserRole.admin;
                case "user" -> UserRole.user;
                default -> throw new IllegalArgumentException("unknown role: " + r);
            };
        }
    }
}
