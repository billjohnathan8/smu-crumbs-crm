package com.scroogebank.crm.transaction_service.security;

import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.Set;

/**
 * Lightweight authenticated principal extracted from a verified JWT.
 */
public record AuthenticatedUser(
	String userId,
	String role
) {
	private static final Set<String> DEFAULT_ROOT_ADMIN_IDS = Set.of("usr_1", "1");
	private static final Set<String> ROOT_ADMIN_IDS = loadRootAdminIds();

	/**
	 * Returns true when the user holds the admin role.
	 */
	public boolean isAdmin() {
		return "admin".equals(role) || "super_admin".equals(role);
	}

	public boolean isRootAdmin() {
		if ("super_admin".equals(role)) {
			return true;
		}
		if (!"admin".equals(role)) {
			return false;
		}
		if (userId == null) {
			return false;
		}
		return ROOT_ADMIN_IDS.contains(userId.trim().toLowerCase());
	}

	public boolean isLimitedAdmin() {
		return "admin".equals(role) && !isRootAdmin();
	}

	/**
	 * Returns true when the user holds the user role.
	 */
	public boolean isUser() {
		return "user".equals(role);
	}

	private static Set<String> loadRootAdminIds() {
		String configured = System.getenv("ROOT_ADMIN_USER_IDS");
		if (configured == null || configured.isBlank()) {
			return DEFAULT_ROOT_ADMIN_IDS;
		}
		Set<String> ids = new LinkedHashSet<>();
		Arrays.stream(configured.split(","))
			.map(String::trim)
			.filter(value -> !value.isBlank())
			.map(String::toLowerCase)
			.forEach(ids::add);
		if (ids.isEmpty()) {
			return DEFAULT_ROOT_ADMIN_IDS;
		}
		return ids;
	}
}


