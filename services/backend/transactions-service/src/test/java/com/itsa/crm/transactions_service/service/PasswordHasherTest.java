package com.itsa.crm.transactions_service.service;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

class PasswordHasherTest {
	@Test
	void hashAndVerify_successAndFailureCases() {
		PasswordHasher passwordHasher = new PasswordHasher();

		String hash = passwordHasher.hash("super-secret");

		assertTrue(passwordHasher.verify("super-secret", hash));
		assertFalse(passwordHasher.verify("wrong-password", hash));
		assertFalse(passwordHasher.verify("super-secret", "pbkdf2_sha1$10$salt$hash"));
		assertFalse(passwordHasher.verify("super-secret", "invalid"));
	}
}
