package com.itsa.crm.clients_service.security;

/**
 * Authenticated user context derived from a validated JWT.
 */
public record AuthenticatedUser(
	String userId,
	String role
) {
	public boolean isAdmin() {
		return "admin".equals(role);
	}

	public boolean isAgent() {
		return "agent".equals(role);
	}
}
