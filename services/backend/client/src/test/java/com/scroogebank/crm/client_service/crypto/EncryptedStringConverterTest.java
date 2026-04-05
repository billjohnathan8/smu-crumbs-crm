package com.scroogebank.crm.client_service.crypto;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

/**
 * Unit tests for {@link EncryptedStringConverter}.
 */
class EncryptedStringConverterTest {
	private static final String VALID_PII_KEY = "MDEyMzQ1Njc4OUFCQ0RFRjAxMjM0NTY3ODlBQkNERUY=";

	private static EncryptedStringConverter newConverterWithValidKey() {
		System.setProperty("PII_ENCRYPTION_KEY", VALID_PII_KEY);
		EncryptedStringConverter.resetForTests();
		return new EncryptedStringConverter();
	}

	@Test
	void nullValue_returnsNullForBothDirections() {
		EncryptedStringConverter converter = newConverterWithValidKey();
		assertThat(converter.convertToDatabaseColumn(null)).isNull();
		assertThat(converter.convertToEntityAttribute(null)).isNull();
	}

	@Test
	void encryptThenDecrypt_returnsOriginalValue() {
		EncryptedStringConverter converter = newConverterWithValidKey();
		String plaintext = "123 Main Street, Springfield";
		String encrypted = converter.convertToDatabaseColumn(plaintext);

		assertThat(encrypted).isNotNull().isNotEqualTo(plaintext);

		String decrypted = converter.convertToEntityAttribute(encrypted);
		assertThat(decrypted).isEqualTo(plaintext);
	}

	@Test
	void emptyString_encryptsAndDecryptsBack() {
		EncryptedStringConverter converter = newConverterWithValidKey();
		String encrypted = converter.convertToDatabaseColumn("");
		assertThat(encrypted).isNotNull().isNotEmpty();

		String decrypted = converter.convertToEntityAttribute(encrypted);
		assertThat(decrypted).isEmpty();
	}

	@Test
	void longString_encryptsAndDecryptsBack() {
		EncryptedStringConverter converter = newConverterWithValidKey();
		String longAddress = "A".repeat(500);
		String encrypted = converter.convertToDatabaseColumn(longAddress);
		String decrypted = converter.convertToEntityAttribute(encrypted);
		assertThat(decrypted).isEqualTo(longAddress);
	}

	@Test
	void unicodeCharacters_encryptAndDecryptCorrectly() {
		EncryptedStringConverter converter = newConverterWithValidKey();
		String unicode = "123 大街, 新加坡 シンガポール";
		String encrypted = converter.convertToDatabaseColumn(unicode);
		String decrypted = converter.convertToEntityAttribute(encrypted);
		assertThat(decrypted).isEqualTo(unicode);
	}

	@Test
	void sameValueEncryptedTwice_producesDifferentCiphertext() {
		EncryptedStringConverter converter = newConverterWithValidKey();
		String plaintext = "Some PII data";
		String encrypted1 = converter.convertToDatabaseColumn(plaintext);
		String encrypted2 = converter.convertToDatabaseColumn(plaintext);
		assertThat(encrypted1).isNotEqualTo(encrypted2);
	}

	@Test
	void missingKey_failsClosed() {
		EncryptedStringConverter converter = new EncryptedStringConverter();
		System.clearProperty("PII_ENCRYPTION_KEY");
		EncryptedStringConverter.resetForTests();

		assertThatThrownBy(() -> converter.convertToDatabaseColumn("123 Main Street"))
			.isInstanceOf(IllegalStateException.class)
			.hasMessageContaining("PII_ENCRYPTION_KEY must be provided");
	}

	@Test
	void invalidKey_failsClosed() {
		EncryptedStringConverter converter = new EncryptedStringConverter();
		System.setProperty("PII_ENCRYPTION_KEY", "not-base64");
		EncryptedStringConverter.resetForTests();

		assertThatThrownBy(() -> converter.convertToDatabaseColumn("123 Main Street"))
			.isInstanceOf(IllegalStateException.class)
			.hasMessageContaining("PII_ENCRYPTION_KEY must be valid Base64");
	}

	@Test
	void tooShortBase64Ciphertext_failsClosed() {
		EncryptedStringConverter converter = newConverterWithValidKey();
		String tooShort = "AQID";
		assertThatThrownBy(() -> converter.convertToEntityAttribute(tooShort))
			.isInstanceOf(IllegalStateException.class)
			.hasMessageContaining("PII ciphertext payload is invalid");
	}

	@Test
	void invalidBase64Ciphertext_failsClosed() {
		EncryptedStringConverter converter = newConverterWithValidKey();
		String invalid = "not!!valid@@base64##";
		assertThatThrownBy(() -> converter.convertToEntityAttribute(invalid))
			.isInstanceOf(IllegalStateException.class)
			.hasMessageContaining("PII ciphertext is not valid Base64");
	}
}
