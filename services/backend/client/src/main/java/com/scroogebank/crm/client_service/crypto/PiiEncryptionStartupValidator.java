package com.scroogebank.crm.client_service.crypto;

import org.springframework.beans.factory.InitializingBean;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Forces fail-closed validation of the PII encryption key during startup.
 */
@Component
public class PiiEncryptionStartupValidator implements InitializingBean {
	private final String configuredPiiKey;

	public PiiEncryptionStartupValidator(@Value("${PII_ENCRYPTION_KEY:}") String configuredPiiKey) {
		this.configuredPiiKey = configuredPiiKey;
	}

	@Override
	public void afterPropertiesSet() {
		if ((System.getProperty("PII_ENCRYPTION_KEY") == null || System.getProperty("PII_ENCRYPTION_KEY").isBlank())
			&& configuredPiiKey != null && !configuredPiiKey.isBlank()) {
			System.setProperty("PII_ENCRYPTION_KEY", configuredPiiKey);
		}
		EncryptedStringConverter.requireUsableKey();
	}

}
