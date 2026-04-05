package com.scroogebank.crm.client_service;

import java.nio.charset.StandardCharsets;
import java.util.Base64;

/**
 * Shared non-production fixtures for tests that need secret-shaped values.
 */
public final class TestSecretFixtures {

	private TestSecretFixtures() {
	}

	public static String piiEncryptionKey() {
		// 32-byte material so strict mode accepts it as an AES-256 key after Base64 decoding.
		return base64("0123456789abcdef0123456789abcdef");
	}

	public static String legacyPiiEncryptionKey() {
		return "legacy-client-pii-fixture-key-v1";
	}

	public static String serviceJwtSecret() {
		return "client-service-test-jwt-secret-v1";
	}

	private static String base64(String value) {
		return Base64.getEncoder().encodeToString(value.getBytes(StandardCharsets.UTF_8));
	}
}