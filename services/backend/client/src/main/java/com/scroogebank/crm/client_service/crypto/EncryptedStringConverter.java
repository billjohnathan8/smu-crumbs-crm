package com.scroogebank.crm.client_service.crypto;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.util.Arrays;
import java.util.Base64;
import javax.crypto.Cipher;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

/**
 * JPA converter that transparently encrypts PII fields using AES-256-GCM before persistence
 * and decrypts on read. The encryption key is derived from the {@code PII_ENCRYPTION_KEY}
 * environment variable using SHA-256.
 *
 * <p>Unencrypted legacy data is returned as-is when decryption fails, allowing a gradual
 * migration path: existing rows are encrypted the next time they are updated.</p>
 */
@Converter
public class EncryptedStringConverter implements AttributeConverter<String, String> {

	private static final String AES_GCM = "AES/GCM/NoPadding";
	private static final int IV_LENGTH_BYTES = 12;
	private static final int GCM_TAG_BITS = 128;
	private static final SecretKey SECRET_KEY;
	private static final SecureRandom SECURE_RANDOM = new SecureRandom();

	static {
		String rawKey = System.getenv("PII_ENCRYPTION_KEY");
		if (rawKey == null || rawKey.isBlank()) {
			rawKey = "dev-only-insecure-pii-key-do-not-use-in-production";
		}
		try {
			MessageDigest digest = MessageDigest.getInstance("SHA-256");
			byte[] keyBytes = digest.digest(rawKey.getBytes(StandardCharsets.UTF_8));
			SECRET_KEY = new SecretKeySpec(keyBytes, "AES");
		}
		catch (NoSuchAlgorithmException ex) {
			throw new ExceptionInInitializerError(ex);
		}
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
			cipher.init(Cipher.ENCRYPT_MODE, SECRET_KEY, new GCMParameterSpec(GCM_TAG_BITS, iv));
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
				return dbData;
			}
			byte[] iv = Arrays.copyOf(combined, IV_LENGTH_BYTES);
			byte[] ciphertext = Arrays.copyOfRange(combined, IV_LENGTH_BYTES, combined.length);
			Cipher cipher = Cipher.getInstance(AES_GCM);
			cipher.init(Cipher.DECRYPT_MODE, SECRET_KEY, new GCMParameterSpec(GCM_TAG_BITS, iv));
			return new String(cipher.doFinal(ciphertext), StandardCharsets.UTF_8);
		}
		catch (IllegalArgumentException ex) {
			return dbData;
		}
		catch (GeneralSecurityException ex) {
			return dbData;
		}
	}
}
