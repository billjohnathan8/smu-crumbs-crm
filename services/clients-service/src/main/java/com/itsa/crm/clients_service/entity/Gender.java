
package com.itsa.crm.clients_service.entity;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

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
