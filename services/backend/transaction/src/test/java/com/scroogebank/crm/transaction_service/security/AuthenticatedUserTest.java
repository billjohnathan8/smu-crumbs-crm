package com.scroogebank.crm.transaction_service.security;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

class AuthenticatedUserTest {

	@Test
	void recordComponents() {
		AuthenticatedUser user = new AuthenticatedUser("usr_1", "admin");
		assertEquals("usr_1", user.userId());
		assertEquals("admin", user.role());
	}

	@Test
	void isAdmin_trueForAdmin() {
		assertTrue(new AuthenticatedUser("u", "admin").isAdmin());
	}

	@Test
	void isAdmin_falseForUser() {
		assertFalse(new AuthenticatedUser("u", "user").isAdmin());
	}

	@Test
	void isUser_trueForUser() {
		assertTrue(new AuthenticatedUser("u", "user").isUser());
	}

	@Test
	void isUser_falseForAdmin() {
		assertFalse(new AuthenticatedUser("u", "admin").isUser());
	}
}
