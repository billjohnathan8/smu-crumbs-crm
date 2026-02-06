package com.itsa.crm.userservice.security;

/**
 * Authenticated principal extracted from a verified JWT.
 *
 * @param userId API user identifier
 * @param role role of the authenticated user
 */
public record AuthenticatedUser(
	String userId,
	String role
) {
	/**
	 * @return true when the user has the admin role
	 */
	public boolean isAdmin() {
		return "admin".equals(role);
	}

	/**
	 * @return true when the user has the agent role
	 */
	public boolean isAgent() {
		return "agent".equals(role);
	}
}
