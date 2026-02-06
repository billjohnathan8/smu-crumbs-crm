package com.itsa.crm.agentservice.service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;
import org.springframework.stereotype.Component;

/**
 * Hashes and verifies passwords using PBKDF2-HMAC-SHA256.
 */
@Component
public class PasswordHasher {
	private static final String ALGO = "PBKDF2WithHmacSHA256";
	private static final int SALT_BYTES = 16;
	private static final int KEY_BITS = 256;
	private static final int ITERATIONS = 120_000;

	private final SecureRandom secureRandom = new SecureRandom();

	/**
	 * Hashes a plaintext password with a random salt.
	 *
	 * @param password plaintext password
	 * @return encoded hash string
	 */
	public String hash(String password) {
		byte[] salt = new byte[SALT_BYTES];
		secureRandom.nextBytes(salt);
		byte[] hash = pbkdf2(password, salt, ITERATIONS);
		return "pbkdf2_sha256$" + ITERATIONS + "$" + b64(salt) + "$" + b64(hash);
	}

	/**
	 * Verifies a plaintext password against a stored hash.
	 *
	 * @param password plaintext password
	 * @param stored encoded hash string
	 * @return true when the password matches
	 */
	public boolean verify(String password, String stored) {
		String[] parts = stored.split("\\$");
		if (parts.length != 4) {
			return false;
		}
		if (!"pbkdf2_sha256".equals(parts[0])) {
			return false;
		}
		int iterations = Integer.parseInt(parts[1]);
		byte[] salt = b64d(parts[2]);
		byte[] expected = b64d(parts[3]);
		byte[] actual = pbkdf2(password, salt, iterations);
		return MessageDigest.isEqual(expected, actual);
	}

	private static byte[] pbkdf2(String password, byte[] salt, int iterations) {
		try {
			PBEKeySpec spec = new PBEKeySpec(password.toCharArray(), salt, iterations, KEY_BITS);
			SecretKeyFactory skf = SecretKeyFactory.getInstance(ALGO);
			return skf.generateSecret(spec).getEncoded();
		}
		catch (Exception ex) {
			throw new IllegalStateException("failed to hash password", ex);
		}
	}

	private static String b64(byte[] bytes) {
		return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
	}

	private static byte[] b64d(String value) {
		return Base64.getUrlDecoder().decode(value.getBytes(StandardCharsets.US_ASCII));
	}
}
