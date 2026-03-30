package com.scroogebank.crm.client_service.logging;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class PiiMaskerTest {

	@Test
	void maskEmail_keepsFirstCharAndDomain() {
		assertThat(PiiMasker.mask("emailAddress", "jordan@example.com"))
			.isEqualTo("j***@example.com");
	}

	@Test
	void maskEmail_singleCharLocal() {
		assertThat(PiiMasker.mask("emailAddress", "a@b.com"))
			.isEqualTo("a***@b.com");
	}

	@Test
	void maskEmail_noAtSign_redacts() {
		assertThat(PiiMasker.mask("emailAddress", "invalid"))
			.isEqualTo("[REDACTED]");
	}

	@Test
	void maskPhone_standardFormat() {
		assertThat(PiiMasker.mask("phoneNumber", "+6591234567"))
			.isEqualTo("+65****4567");
	}

	@Test
	void maskPhone_longNumber() {
		assertThat(PiiMasker.mask("phoneNumber", "+442071234567"))
			.isEqualTo("+44******4567");
	}

	@Test
	void maskPhone_tooShort_redacts() {
		assertThat(PiiMasker.mask("phoneNumber", "+65123"))
			.isEqualTo("[REDACTED]");
	}

	@ParameterizedTest
	@ValueSource(strings = {"address", "city", "state", "verificationToken", "clientId", "primaryDocumentRef"})
	void fullyRedactedFields(String fieldName) {
		assertThat(PiiMasker.mask(fieldName, "123 Main Street"))
			.isEqualTo("[REDACTED]");
	}

	@Test
	void maskPostalCode_sixDigit() {
		assertThat(PiiMasker.mask("postalCode", "627040"))
			.isEqualTo("***040");
	}

	@Test
	void maskPostalCode_fiveDigit() {
		assertThat(PiiMasker.mask("postalCode", "62704"))
			.isEqualTo("**704");
	}

	@Test
	void maskPostalCode_threeOrLess_redacts() {
		assertThat(PiiMasker.mask("postalCode", "123"))
			.isEqualTo("[REDACTED]");
	}

	@Test
	void nonPiiField_passesThrough() {
		assertThat(PiiMasker.mask("firstName", "Jordan"))
			.isEqualTo("Jordan");
	}

	@Test
	void nonPiiField_lastName_passesThrough() {
		assertThat(PiiMasker.mask("lastName", "Smith"))
			.isEqualTo("Smith");
	}

	@Test
	void nonPiiField_gender_passesThrough() {
		assertThat(PiiMasker.mask("gender", "Male"))
			.isEqualTo("Male");
	}

	@Test
	void nonPiiField_accountType_passesThrough() {
		assertThat(PiiMasker.mask("accountType", "Savings"))
			.isEqualTo("Savings");
	}

	@Test
	void nullValue_returnsNull() {
		assertThat(PiiMasker.mask("emailAddress", null)).isNull();
	}

	@Test
	void nullFieldName_returnsValueUnchanged() {
		assertThat(PiiMasker.mask(null, "anything")).isEqualTo("anything");
	}
}
