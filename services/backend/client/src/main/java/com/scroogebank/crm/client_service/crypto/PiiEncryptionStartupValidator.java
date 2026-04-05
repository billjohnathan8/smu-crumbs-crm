package com.scroogebank.crm.client_service.crypto;

import jakarta.annotation.PostConstruct;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Forces fail-closed validation of the PII encryption key during startup.
 */
@Component
public class PiiEncryptionStartupValidator {
	private final String configuredPiiKey;

	public PiiEncryptionStartupValidator(@Value("${PII_ENCRYPTION_KEY:}") String configuredPiiKey) {
		this.configuredPiiKey = configuredPiiKey;
	}

	@PostConstruct
	void validatePiiEncryptionKey() {
		if ((System.getProperty("PII_ENCRYPTION_KEY") == null || System.getProperty("PII_ENCRYPTION_KEY").isBlank())
			&& configuredPiiKey != null && !configuredPiiKey.isBlank()) {
			System.setProperty("PII_ENCRYPTION_KEY", configuredPiiKey);
		}
		EncryptedStringConverter.requireUsableKey();
	}

}
