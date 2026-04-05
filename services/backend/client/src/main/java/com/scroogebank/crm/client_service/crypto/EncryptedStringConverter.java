package com.scroogebank.crm.client_service.crypto;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.security.GeneralSecurityException;
import java.security.SecureRandom;
import java.util.Arrays;
import javax.crypto.Cipher;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

/**
 * JPA converter that transparently encrypts PII fields using AES-256-GCM before persistence
 * and decrypts on read. The encryption key must be provided via {@code PII_ENCRYPTION_KEY}
 * as a Base64-encoded 32-byte key.
 */
@Converter
public class EncryptedStringConverter implements AttributeConverter<String, String> {

	private static final String AES_GCM = "AES/GCM/NoPadding";
	private static final int IV_LENGTH_BYTES = 12;
	private static final int GCM_TAG_BITS = 128;
	private static final int KEY_LENGTH_BYTES = 32;
	private static volatile SecretKey secretKey;
	private static final SecureRandom SECURE_RANDOM = new SecureRandom();

	static void requireUsableKey() {
		getSecretKey();
	}

	static void resetForTests() {
		secretKey = null;
	}

	private static SecretKey getSecretKey() {
		SecretKey current = secretKey;
		if (current != null) {
			return current;
		}
		synchronized (EncryptedStringConverter.class) {
			if (secretKey == null) {
				secretKey = initializeSecretKey();
			}
			return secretKey;
		}
	}

	private static SecretKey initializeSecretKey() {
		String rawKey = System.getProperty("PII_ENCRYPTION_KEY");
		if (rawKey == null || rawKey.isBlank()) {
			rawKey = System.getenv("PII_ENCRYPTION_KEY");
		}
		if (rawKey == null || rawKey.isBlank()) {
			throw new IllegalStateException("PII_ENCRYPTION_KEY must be provided");
		}

		final byte[] keyBytes;
		try {
			keyBytes = Base64.getDecoder().decode(rawKey.getBytes(StandardCharsets.UTF_8));
		}
		catch (IllegalArgumentException ex) {
			throw new IllegalStateException("PII_ENCRYPTION_KEY must be valid Base64", ex);
		}
		if (keyBytes.length != KEY_LENGTH_BYTES) {
			throw new IllegalStateException("PII_ENCRYPTION_KEY must decode to exactly 32 bytes");
		}
		return new SecretKeySpec(keyBytes, "AES");
	}

	@Override
	public String convertToDatabaseColumn(String attribute) {
		if (attribute == null) {
			return null;
		}
		try {
			byte[] iv = new byte[IV_LENGTH_BYTES];
			SECURE_RANDOM.nextBytes(iv);
			Cipher cipher = Cipher.getInstance(AES_GCM);
			cipher.init(Cipher.ENCRYPT_MODE, getSecretKey(), new GCMParameterSpec(GCM_TAG_BITS, iv));
			byte[] ciphertext = cipher.doFinal(attribute.getBytes(StandardCharsets.UTF_8));
			byte[] combined = new byte[iv.length + ciphertext.length];
			System.arraycopy(iv, 0, combined, 0, iv.length);
			System.arraycopy(ciphertext, 0, combined, iv.length, ciphertext.length);
			return Base64.getEncoder().encodeToString(combined);
		}
		catch (GeneralSecurityException ex) {
			throw new IllegalStateException("PII encryption failed", ex);
		}
	}

	@Override
	public String convertToEntityAttribute(String dbData) {
		if (dbData == null) {
			return null;
		}
		try {
			byte[] combined = Base64.getDecoder().decode(dbData);
			if (combined.length <= IV_LENGTH_BYTES) {
				throw new IllegalStateException("PII ciphertext payload is invalid");
			}
			byte[] iv = Arrays.copyOf(combined, IV_LENGTH_BYTES);
			byte[] ciphertext = Arrays.copyOfRange(combined, IV_LENGTH_BYTES, combined.length);
			Cipher cipher = Cipher.getInstance(AES_GCM);
			cipher.init(Cipher.DECRYPT_MODE, getSecretKey(), new GCMParameterSpec(GCM_TAG_BITS, iv));
			return new String(cipher.doFinal(ciphertext), StandardCharsets.UTF_8);
		}
		catch (IllegalArgumentException ex) {
			throw new IllegalStateException("PII ciphertext is not valid Base64", ex);
		}
		catch (GeneralSecurityException ex) {
			throw new IllegalStateException("PII decryption failed", ex);
		}
	}
}
