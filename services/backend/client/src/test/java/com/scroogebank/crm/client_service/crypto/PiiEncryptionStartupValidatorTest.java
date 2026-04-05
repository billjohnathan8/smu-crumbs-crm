package com.scroogebank.crm.client_service.crypto;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.catchThrowable;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.BeanCreationException;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.core.NestedExceptionUtils;

/**
 * Startup-safety tests for fail-closed PII key validation.
 */
class PiiEncryptionStartupValidatorTest {

	private static final String VALID_PII_KEY = "MDEyMzQ1Njc4OUFCQ0RFRjAxMjM0NTY3ODlBQkNERUY=";

	private static void resetToValidKeyState() {
		System.setProperty("PII_ENCRYPTION_KEY", VALID_PII_KEY);
		EncryptedStringConverter.resetForTests();
	}

	@Test
	void startupFailsWhenKeyMissing() {
		try {
			System.clearProperty("PII_ENCRYPTION_KEY");
			EncryptedStringConverter.resetForTests();

			assertThatThrownBy(() -> new AnnotationConfigApplicationContext(PiiEncryptionStartupValidator.class))
				.isInstanceOf(BeanCreationException.class)
				.hasRootCauseInstanceOf(IllegalStateException.class)
				.hasRootCauseMessage("PII_ENCRYPTION_KEY must be provided");
		}
		finally {
			resetToValidKeyState();
		}
	}

	@Test
	void startupSucceedsWhenKeyValid() {
		try {
			resetToValidKeyState();

			try (AnnotationConfigApplicationContext context =
				new AnnotationConfigApplicationContext(PiiEncryptionStartupValidator.class)) {
				assertThat(context.isActive()).isTrue();
			}
		}
		finally {
			resetToValidKeyState();
		}
	}

	@Test
	void startupFailsWhenKeyInvalid() {
		try {
			System.setProperty("PII_ENCRYPTION_KEY", "invalid");
			EncryptedStringConverter.resetForTests();

			Throwable thrown = catchThrowable(() -> new AnnotationConfigApplicationContext(PiiEncryptionStartupValidator.class));
			assertThat(thrown).isInstanceOf(BeanCreationException.class)
				.hasRootCauseInstanceOf(IllegalStateException.class);
			assertThat(NestedExceptionUtils.getMostSpecificCause(thrown).getMessage())
				.contains("PII_ENCRYPTION_KEY must");
		}
		finally {
			resetToValidKeyState();
		}
	}

}
