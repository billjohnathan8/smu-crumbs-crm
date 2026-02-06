package com.itsa.crm.userservice.security;

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

