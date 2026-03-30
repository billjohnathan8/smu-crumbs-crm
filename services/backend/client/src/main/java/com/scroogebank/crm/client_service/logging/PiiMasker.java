package com.scroogebank.crm.client_service.logging;

import java.util.Set;

/**
 * Masks PII field values before they are sent to the audit log service.
 * Non-PII fields pass through unchanged.
 */
public final class PiiMasker {

	private static final String REDACTED = "[REDACTED]";

	private static final Set<String> FULLY_REDACTED_FIELDS = Set.of(
		"address", "city", "state",
		"nric", "verificationToken", "token", "primaryDocumentRef", "addressDocumentRef",
		"primaryDocumentBase64", "addressDocumentBase64", "primaryDocumentMimeType", "addressDocumentMimeType",
		"clientId", "accountId", "assignedUserId", "userId"
	);

	private static final Set<String> PII_FIELDS = Set.of(
		"emailAddress", "phoneNumber", "address", "city", "state", "postalCode",
		"nric", "verificationToken", "token", "primaryDocumentRef", "addressDocumentRef",
		"primaryDocumentBase64", "addressDocumentBase64", "primaryDocumentMimeType", "addressDocumentMimeType",
		"clientId", "accountId", "assignedUserId", "userId"
	);

	private PiiMasker() {}

	/**
	 * Returns a masked representation of the value if the field is PII,
	 * or the original value if it is not.
	 *
	 * @param fieldName the audit attribute name
	 * @param value     the raw value (nullable)
	 * @return masked or original value
	 */
	public static String mask(String fieldName, String value) {
		if (value == null || fieldName == null) {
			return value;
		}
		if (!PII_FIELDS.contains(fieldName)) {
			return value;
		}
		if (FULLY_REDACTED_FIELDS.contains(fieldName)) {
			return REDACTED;
		}
		return switch (fieldName) {
			case "emailAddress" -> maskEmail(value);
			case "phoneNumber" -> maskPhone(value);
			case "postalCode" -> maskPostalCode(value);
			default -> REDACTED;
		};
	}

	private static String maskEmail(String email) {
		int at = email.indexOf('@');
		if (at <= 0) {
			return REDACTED;
		}
		return email.charAt(0) + "***" + email.substring(at);
	}

	private static String maskPhone(String phone) {
		if (phone.length() <= 7) {
			return REDACTED;
		}
		return phone.substring(0, 3) + "*".repeat(phone.length() - 7) + phone.substring(phone.length() - 4);
	}

	private static String maskPostalCode(String code) {
		if (code.length() <= 3) {
			return REDACTED;
		}
		return "*".repeat(code.length() - 3) + code.substring(code.length() - 3);
	}
}
