package com.scroogebank.crm.client_service.crypto;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import org.junit.jupiter.api.Test;

/**
 * Unit tests for {@link EncryptedStringConverter}.
 */
class EncryptedStringConverterTest {
	private static final String MODERN_KEY = "MDEyMzQ1Njc4OUFCQ0RFRjAxMjM0NTY3ODlBQkNERUY=";
	private static final String LEGACY_RAW_KEY = "dev-only-insecure-pii-key-do-not-use-in-production";

	private static void resetCryptoState() {
		System.clearProperty("PII_ENCRYPTION_KEY");
		System.clearProperty("PII_STRICT_MODE");
		EncryptedStringConverter.resetForTests();
	}

	@Test
	void modernMode_encryptThenDecrypt_returnsOriginalValue() {
		resetCryptoState();
		try {
			System.setProperty("PII_ENCRYPTION_KEY", MODERN_KEY);
			EncryptedStringConverter converter = new EncryptedStringConverter();

			String encrypted = converter.convertToDatabaseColumn("123 Main Street");
			assertThat(encrypted).isNotBlank().isNotEqualTo("123 Main Street");
			assertThat(converter.convertToEntityAttribute(encrypted)).isEqualTo("123 Main Street");
		}
		finally {
			resetCryptoState();
		}
	}

	@Test
	void compatibilityMode_decryptsLegacyCiphertext() throws Exception {
		resetCryptoState();
		try {
			System.setProperty("PII_ENCRYPTION_KEY", MODERN_KEY);
			EncryptedStringConverter converter = new EncryptedStringConverter();
			String legacyCiphertext = legacyEncrypt("legacy-value", LEGACY_RAW_KEY);

			assertThat(converter.convertToEntityAttribute(legacyCiphertext)).isEqualTo("legacy-value");
		}
		finally {
			resetCryptoState();
		}
	}

	@Test
	void compatibilityMode_returnsOriginalWhenCiphertextUnreadable() {
		resetCryptoState();
		try {
			System.setProperty("PII_ENCRYPTION_KEY", MODERN_KEY);
			EncryptedStringConverter converter = new EncryptedStringConverter();
			String unknownCiphertext = legacyEncryptUnchecked("legacy-value", "some-other-legacy-key");

			assertThat(converter.convertToEntityAttribute(unknownCiphertext)).isEqualTo(unknownCiphertext);
		}
		finally {
			resetCryptoState();
		}
	}

	@Test
	void strictMode_rejectsInvalidCiphertext() {
		resetCryptoState();
		try {
			System.setProperty("PII_ENCRYPTION_KEY", MODERN_KEY);
			System.setProperty("PII_STRICT_MODE", "true");
			EncryptedStringConverter converter = new EncryptedStringConverter();

			assertThatThrownBy(() -> converter.convertToEntityAttribute("not-base64"))
				.isInstanceOf(IllegalStateException.class)
				.hasMessageContaining("not valid Base64");
		}
		finally {
			resetCryptoState();
		}
	}

	@Test
	void strictMode_requiresModernBase64Key() {
		resetCryptoState();
		try {
			System.setProperty("PII_ENCRYPTION_KEY", LEGACY_RAW_KEY);
			System.setProperty("PII_STRICT_MODE", "true");
			EncryptedStringConverter converter = new EncryptedStringConverter();
			EncryptedStringConverter.resetForTests();

			assertThatThrownBy(() -> converter.convertToDatabaseColumn("value"))
				.isInstanceOf(IllegalStateException.class)
				.hasMessageContaining("must be valid Base64");
		}
		finally {
			resetCryptoState();
		}
	}

	@Test
	void migrationPlan_rewritesLegacyCiphertextToModern() throws Exception {
		resetCryptoState();
		try {
			System.setProperty("PII_ENCRYPTION_KEY", MODERN_KEY);
			String legacyCiphertext = legacyEncrypt("legacy-value", LEGACY_RAW_KEY);

			EncryptedStringConverter.ReencryptionPlan plan = EncryptedStringConverter.planModernReencryption(legacyCiphertext);
			assertThat(plan.rewrite()).isTrue();
			assertThat(plan.unreadable()).isFalse();

			EncryptedStringConverter converter = new EncryptedStringConverter();
			assertThat(converter.convertToEntityAttribute(plan.value())).isEqualTo("legacy-value");
		}
		finally {
			resetCryptoState();
		}
	}

	private static String legacyEncryptUnchecked(String plaintext, String rawKey) {
		try {
			return legacyEncrypt(plaintext, rawKey);
		}
		catch (Exception ex) {
			throw new IllegalStateException(ex);
		}
	}

	private static String legacyEncrypt(String plaintext, String rawKey) throws Exception {
		byte[] iv = new byte[12];
		new SecureRandom().nextBytes(iv);
		byte[] keyBytes = MessageDigest.getInstance("SHA-256").digest(rawKey.getBytes(StandardCharsets.UTF_8));
		Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
		cipher.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(keyBytes, "AES"), new GCMParameterSpec(128, iv));
		byte[] ciphertext = cipher.doFinal(plaintext.getBytes(StandardCharsets.UTF_8));

		byte[] combined = new byte[iv.length + ciphertext.length];
		System.arraycopy(iv, 0, combined, 0, iv.length);
		System.arraycopy(ciphertext, 0, combined, iv.length, ciphertext.length);
		return Base64.getEncoder().encodeToString(combined);
	}
}
