package com.scroogebank.crm.client_service.crypto;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.catchThrowable;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.BeanCreationException;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.core.NestedExceptionUtils;
import org.springframework.test.util.ReflectionTestUtils;

import com.scroogebank.crm.client_service.TestSecretFixtures;

/**
 * Startup-safety tests for release-1 compatibility mode and release-2 strict mode.
 */
class PiiEncryptionStartupValidatorTest {
	private static final String VALID_PII_KEY = TestSecretFixtures.piiEncryptionKey();

	private static void resetCryptoState() {
		System.clearProperty("PII_ENCRYPTION_KEY");
		System.clearProperty("PII_STRICT_MODE");
		System.clearProperty("app.pii.strict-mode");
		EncryptedStringConverter.resetForTests();
	}

	@Test
	void startupSucceedsInCompatibilityModeWhenKeyMissing() {
		resetCryptoState();
		try {
			System.clearProperty("PII_ENCRYPTION_KEY");
			EncryptedStringConverter.resetForTests();

			try (AnnotationConfigApplicationContext context =
				new AnnotationConfigApplicationContext(PiiEncryptionStartupValidator.class)) {
				assertThat(context.isActive()).isTrue();
			}
		}
		finally {
			resetCryptoState();
		}
	}

	@Test
	void startupFailsInStrictModeWhenKeyMissing() {
		resetCryptoState();
		try {
			PiiEncryptionStartupValidator validator = new PiiEncryptionStartupValidator("", true);
			EncryptedStringConverter.resetForTests();

			assertThatThrownBy(validator::afterPropertiesSet)
				.isInstanceOf(IllegalStateException.class)
				.hasMessageContaining("must be provided");
		}
		finally {
			resetCryptoState();
		}
	}

	@Test
	void startupFailsInStrictModeWhenKeyInvalid() {
		resetCryptoState();
		try {
			PiiEncryptionStartupValidator validator = new PiiEncryptionStartupValidator("invalid", true);
			EncryptedStringConverter.resetForTests();

			Throwable thrown = catchThrowable(validator::afterPropertiesSet);
			assertThat(thrown).isInstanceOf(IllegalStateException.class);
			assertThat(NestedExceptionUtils.getMostSpecificCause(thrown).getMessage())
				.contains("must be valid Base64");
		}
		finally {
			resetCryptoState();
		}
	}

	@Test
	void startupSucceedsInStrictModeWhenKeyValid() {
		resetCryptoState();
		try {
			PiiEncryptionStartupValidator validator = new PiiEncryptionStartupValidator(VALID_PII_KEY, true);
			EncryptedStringConverter.resetForTests();

			validator.afterPropertiesSet();
			assertThat(System.getProperty("PII_STRICT_MODE")).isEqualTo("true");
		}
		finally {
			resetCryptoState();
		}
	}

	@Test
	void springContextBindsStrictModeProperty() {
		resetCryptoState();
		try {
			System.setProperty("PII_ENCRYPTION_KEY", VALID_PII_KEY);
			System.setProperty("app.pii.strict-mode", "true");
			EncryptedStringConverter.resetForTests();

			try (AnnotationConfigApplicationContext context =
				new AnnotationConfigApplicationContext(PiiEncryptionStartupValidator.class)) {
				PiiEncryptionStartupValidator validator = context.getBean(PiiEncryptionStartupValidator.class);
				assertThat(ReflectionTestUtils.getField(validator, "strictMode")).isEqualTo(true);
			}
			catch (BeanCreationException ex) {
				throw ex;
			}
		}
		finally {
			resetCryptoState();
		}
	}
}
