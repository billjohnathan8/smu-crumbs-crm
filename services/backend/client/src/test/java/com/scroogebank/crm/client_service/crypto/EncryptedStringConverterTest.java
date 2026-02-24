package com.scroogebank.crm.client_service.crypto;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * Unit tests for {@link EncryptedStringConverter}.
 */
class EncryptedStringConverterTest {

	private EncryptedStringConverter converter;

	@BeforeEach
	void setUp() {
		converter = new EncryptedStringConverter();
	}

	@Test
	void nullValue_returnsNullForBothDirections() {
		assertThat(converter.convertToDatabaseColumn(null)).isNull();
		assertThat(converter.convertToEntityAttribute(null)).isNull();
	}

	@Test
	void encryptThenDecrypt_returnsOriginalValue() {
		String plaintext = "123 Main Street, Springfield";
		String encrypted = converter.convertToDatabaseColumn(plaintext);

		assertThat(encrypted).isNotNull().isNotEqualTo(plaintext);

		String decrypted = converter.convertToEntityAttribute(encrypted);
		assertThat(decrypted).isEqualTo(plaintext);
	}

	@Test
	void emptyString_encryptsAndDecryptsBack() {
		String encrypted = converter.convertToDatabaseColumn("");
		assertThat(encrypted).isNotNull().isNotEmpty();

		String decrypted = converter.convertToEntityAttribute(encrypted);
		assertThat(decrypted).isEmpty();
	}

	@Test
	void longString_encryptsAndDecryptsBack() {
		String longAddress = "A".repeat(500);
		String encrypted = converter.convertToDatabaseColumn(longAddress);
		String decrypted = converter.convertToEntityAttribute(encrypted);
		assertThat(decrypted).isEqualTo(longAddress);
	}

	@Test
	void unicodeCharacters_encryptAndDecryptCorrectly() {
		String unicode = "123 大街, 新加坡 シンガポール";
		String encrypted = converter.convertToDatabaseColumn(unicode);
		String decrypted = converter.convertToEntityAttribute(encrypted);
		assertThat(decrypted).isEqualTo(unicode);
	}

	@Test
	void sameValueEncryptedTwice_producesDifferentCiphertext() {
		String plaintext = "Some PII data";
		String encrypted1 = converter.convertToDatabaseColumn(plaintext);
		String encrypted2 = converter.convertToDatabaseColumn(plaintext);
		assertThat(encrypted1).isNotEqualTo(encrypted2);
	}

	@Test
	void unencryptedLegacyData_returnedAsIs() {
		String plaintext = "123 Main Street";
		String result = converter.convertToEntityAttribute(plaintext);
		assertThat(result).isEqualTo(plaintext);
	}

	@Test
	void invalidBase64_returnedAsIs() {
		String invalid = "not!!valid@@base64##";
		String result = converter.convertToEntityAttribute(invalid);
		assertThat(result).isEqualTo(invalid);
	}

	@Test
	void tooShortBase64_returnedAsIs() {
		String tooShort = "AQID";
		String result = converter.convertToEntityAttribute(tooShort);
		assertThat(result).isEqualTo(tooShort);
	}
}
