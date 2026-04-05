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
import java.util.LinkedHashMap;
import java.util.Map;
import javax.crypto.Cipher;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

/**
 * JPA converter that transparently encrypts PII fields using AES-256-GCM before persistence
 * and decrypts on read.
 *
 * <p>During key-format migration, we support both key styles:
 * <ul>
 *   <li>Modern: {@code PII_ENCRYPTION_KEY} is Base64-decoded to a 32-byte AES key.</li>
 *   <li>Legacy: {@code PII_ENCRYPTION_KEY} is treated as a raw string and SHA-256 hashed.</li>
 * </ul>
 *
 * <p>Release-1 compatibility mode keeps reads fail-open to avoid prod breakage on mixed-key rows.
 * Set {@code APP_PII_STRICT_MODE=true} for release-2 strict mode.
 */
@Converter
public class EncryptedStringConverter implements AttributeConverter<String, String> {

	private static final String AES_GCM = "AES/GCM/NoPadding";
	private static final int IV_LENGTH_BYTES = 12;
	private static final int GCM_TAG_BITS = 128;
	private static final int KEY_LENGTH_BYTES = 32;
	private static final String LEGACY_DEFAULT_RAW_KEY = "dev-only-insecure-pii-key-do-not-use-in-production";
	private static final String STRICT_MODE_FLAG_PROPERTY = "PII_STRICT_MODE";
	private static final String STRICT_MODE_FLAG_ENV = "APP_PII_STRICT_MODE";
	private static volatile KeyContext keyContext;
	private static final SecureRandom SECURE_RANDOM = new SecureRandom();

	static void requireUsableKey() {
		getKeyContext();
	}

	static void resetForTests() {
		keyContext = null;
	}

	private static KeyContext getKeyContext() {
		KeyContext current = keyContext;
		if (current != null) {
			return current;
		}
		synchronized (EncryptedStringConverter.class) {
			if (keyContext == null) {
				keyContext = initializeKeyContext();
			}
			return keyContext;
		}
	}

	private static KeyContext initializeKeyContext() {
		String rawKey = System.getProperty("PII_ENCRYPTION_KEY");
		if (rawKey == null || rawKey.isBlank()) {
			rawKey = System.getenv("PII_ENCRYPTION_KEY");
		}
		boolean strictMode = isStrictModeEnabled();

		SecretKey modernKey = null;
		Map<String, SecretKey> decryptionKeyMap = new LinkedHashMap<>();

		if (strictMode) {
			if (rawKey == null || rawKey.isBlank()) {
				throw new IllegalStateException("PII_ENCRYPTION_KEY must be provided");
			}
			modernKey = decodeModernKey(rawKey);
			if (modernKey == null) {
				throw new IllegalStateException("PII_ENCRYPTION_KEY must be valid Base64 and decode to exactly 32 bytes");
			}
			putKeyIfAbsent(decryptionKeyMap, modernKey);
			return new KeyContext(modernKey, modernKey, fingerprint(modernKey),
				decryptionKeyMap.values().toArray(new SecretKey[0]), true);
		}

		if (rawKey == null || rawKey.isBlank()) {
			rawKey = LEGACY_DEFAULT_RAW_KEY;
		}

		modernKey = decodeModernKey(rawKey);
		SecretKey encryptionKey = modernKey != null ? modernKey : deriveLegacyKey(rawKey);
		putKeyIfAbsent(decryptionKeyMap, encryptionKey);
		if (modernKey != null) {
			putKeyIfAbsent(decryptionKeyMap, deriveLegacyKey(rawKey));
		}
		putKeyIfAbsent(decryptionKeyMap, deriveLegacyKey(LEGACY_DEFAULT_RAW_KEY));

		return new KeyContext(encryptionKey, modernKey, fingerprint(modernKey),
			decryptionKeyMap.values().toArray(new SecretKey[0]), false);
	}

	private static boolean isStrictModeEnabled() {
		String strictFlag = System.getProperty(STRICT_MODE_FLAG_PROPERTY);
		if (strictFlag == null || strictFlag.isBlank()) {
			strictFlag = System.getenv(STRICT_MODE_FLAG_ENV);
		}
		if (strictFlag == null || strictFlag.isBlank()) {
			strictFlag = System.getenv(STRICT_MODE_FLAG_PROPERTY);
		}
		return Boolean.parseBoolean(strictFlag);
	}

	private static SecretKey decodeModernKey(String rawKey) {
		try {
			byte[] keyBytes = Base64.getDecoder().decode(rawKey.getBytes(StandardCharsets.UTF_8));
			if (keyBytes.length != KEY_LENGTH_BYTES) {
				return null;
			}
			return new SecretKeySpec(keyBytes, "AES");
		}
		catch (IllegalArgumentException ex) {
			return null;
		}
	}

	private static SecretKey deriveLegacyKey(String rawKey) {
		try {
			MessageDigest digest = MessageDigest.getInstance("SHA-256");
			byte[] keyBytes = digest.digest(rawKey.getBytes(StandardCharsets.UTF_8));
			return new SecretKeySpec(keyBytes, "AES");
		}
		catch (NoSuchAlgorithmException ex) {
			throw new IllegalStateException("Unable to derive legacy PII key", ex);
		}
	}

	private static void putKeyIfAbsent(Map<String, SecretKey> keys, SecretKey key) {
		keys.putIfAbsent(fingerprint(key), key);
	}

	private static String fingerprint(SecretKey key) {
		if (key == null) {
			return "";
		}
		return Base64.getEncoder().encodeToString(key.getEncoded());
	}

	@Override
	public String convertToDatabaseColumn(String attribute) {
		if (attribute == null) {
			return null;
		}
		return encryptWithKey(attribute, getKeyContext().encryptionKey());
	}

	@Override
	public String convertToEntityAttribute(String dbData) {
		if (dbData == null) {
			return null;
		}
		KeyContext context = getKeyContext();
		DecryptionAttempt attempt = attemptDecrypt(dbData, context);
		return switch (attempt.status()) {
			case MODERN, LEGACY -> attempt.value();
			case INVALID_BASE64 -> {
				if (context.strictMode()) {
					throw new IllegalStateException("PII ciphertext is not valid Base64");
				}
				yield dbData;
			}
			case INVALID_PAYLOAD -> {
				if (context.strictMode()) {
					throw new IllegalStateException("PII ciphertext payload is invalid");
				}
				yield dbData;
			}
			case UNREADABLE -> {
				if (context.strictMode()) {
					throw new IllegalStateException("PII decryption failed");
				}
				yield dbData;
			}
		};
	}

	static ReencryptionPlan planModernReencryption(String storedValue) {
		if (storedValue == null) {
			return ReencryptionPlan.keep(null);
		}
		KeyContext context = getKeyContext();
		if (context.modernKey() == null) {
			return ReencryptionPlan.keep(storedValue);
		}
		DecryptionAttempt attempt = attemptDecrypt(storedValue, context);
		return switch (attempt.status()) {
			case MODERN -> ReencryptionPlan.keep(storedValue);
			case LEGACY -> ReencryptionPlan.rewrite(encryptWithKey(attempt.value(), context.modernKey()));
			case INVALID_BASE64, INVALID_PAYLOAD -> ReencryptionPlan.rewrite(encryptWithKey(storedValue, context.modernKey()));
			case UNREADABLE -> ReencryptionPlan.unreadable(storedValue);
		};
	}

	private static String encryptWithKey(String plaintext, SecretKey key) {
		try {
			byte[] iv = new byte[IV_LENGTH_BYTES];
			SECURE_RANDOM.nextBytes(iv);
			Cipher cipher = Cipher.getInstance(AES_GCM);
			cipher.init(Cipher.ENCRYPT_MODE, key, new GCMParameterSpec(GCM_TAG_BITS, iv));
			byte[] ciphertext = cipher.doFinal(plaintext.getBytes(StandardCharsets.UTF_8));
			byte[] combined = new byte[iv.length + ciphertext.length];
			System.arraycopy(iv, 0, combined, 0, iv.length);
			System.arraycopy(ciphertext, 0, combined, iv.length, ciphertext.length);
			return Base64.getEncoder().encodeToString(combined);
		}
		catch (GeneralSecurityException ex) {
			throw new IllegalStateException("PII encryption failed", ex);
		}
	}

	private static DecryptionAttempt attemptDecrypt(String dbData, KeyContext context) {
		final byte[] combined;
		try {
			combined = Base64.getDecoder().decode(dbData);
		}
		catch (IllegalArgumentException ex) {
			return new DecryptionAttempt(DecryptStatus.INVALID_BASE64, dbData);
		}
		if (combined.length <= IV_LENGTH_BYTES) {
			return new DecryptionAttempt(DecryptStatus.INVALID_PAYLOAD, dbData);
		}

		byte[] iv = Arrays.copyOf(combined, IV_LENGTH_BYTES);
		byte[] ciphertext = Arrays.copyOfRange(combined, IV_LENGTH_BYTES, combined.length);
		for (SecretKey candidate : context.decryptionKeys()) {
			try {
				Cipher cipher = Cipher.getInstance(AES_GCM);
				cipher.init(Cipher.DECRYPT_MODE, candidate, new GCMParameterSpec(GCM_TAG_BITS, iv));
				String plaintext = new String(cipher.doFinal(ciphertext), StandardCharsets.UTF_8);
				boolean modernKeyHit = context.modernFingerprint().equals(fingerprint(candidate));
				return new DecryptionAttempt(modernKeyHit ? DecryptStatus.MODERN : DecryptStatus.LEGACY, plaintext);
			}
			catch (GeneralSecurityException ex) {
				// Try the next compatibility key.
			}
		}
		return new DecryptionAttempt(DecryptStatus.UNREADABLE, dbData);
	}

	private record KeyContext(
		SecretKey encryptionKey,
		SecretKey modernKey,
		String modernFingerprint,
		SecretKey[] decryptionKeys,
		boolean strictMode
	) {}

	private enum DecryptStatus {
		MODERN,
		LEGACY,
		INVALID_BASE64,
		INVALID_PAYLOAD,
		UNREADABLE
	}

	private record DecryptionAttempt(DecryptStatus status, String value) {}

	record ReencryptionPlan(boolean rewrite, boolean unreadable, String value) {
		static ReencryptionPlan keep(String value) {
			return new ReencryptionPlan(false, false, value);
		}

		static ReencryptionPlan rewrite(String value) {
			return new ReencryptionPlan(true, false, value);
		}

		static ReencryptionPlan unreadable(String value) {
			return new ReencryptionPlan(false, true, value);
		}
	}
}
