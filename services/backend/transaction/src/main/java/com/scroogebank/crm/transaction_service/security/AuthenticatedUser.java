package com.scroogebank.crm.transaction_service.security;

/**
 * Lightweight authenticated principal extracted from a verified JWT.
 */
public record AuthenticatedUser(
	String userId,
	String role
) {
	/**
	 * Returns true when the user holds the admin role.
	 */
	public boolean isAdmin() {
		return "admin".equals(role);
	}

	/**
	 * Returns true when the user holds the agent role.
	 */
	public boolean isAgent() {
		return "agent".equals(role);
	}
}



