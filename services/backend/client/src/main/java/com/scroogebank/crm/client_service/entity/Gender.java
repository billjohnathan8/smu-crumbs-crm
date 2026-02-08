
package com.scroogebank.crm.client_service.entity;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/**
 * Supported gender values with stable API string mappings.
 */
public enum Gender {
	MALE("Male"),
	FEMALE("Female"),
	NON_BINARY("Non-binary"),
	PREFER_NOT_TO_SAY("Prefer not to say");

	private final String apiValue;

	Gender(String apiValue) {
		this.apiValue = apiValue;
	}

	@JsonValue
	public String getApiValue() {
		return apiValue;
	}

	/**
	 * Parses a gender from its API string value.
	 *
	 * @param value API value
	 * @return matching gender
	 * @throws IllegalArgumentException when the value is not supported
	 */
	@JsonCreator
	public static Gender fromApiValue(String value) {
		for (Gender gender : values()) {
			if (gender.apiValue.equals(value)) {
				return gender;
			}
		}
		throw new IllegalArgumentException("Unsupported gender: " + value);
	}
}
