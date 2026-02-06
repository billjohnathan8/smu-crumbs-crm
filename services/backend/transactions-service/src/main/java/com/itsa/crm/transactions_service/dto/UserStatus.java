package com.itsa.crm.transactions_service.dto;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/**
 * User account status values used by the API.
 */
public enum UserStatus {
	active("active"),
	disabled("disabled");

	private final String wireValue;

	UserStatus(String wireValue) {
		this.wireValue = wireValue;
	}

	@JsonValue
	public String wireValue() {
		return wireValue;
	}

	@JsonCreator
	public static UserStatus fromWireValue(String value) {
		for (UserStatus status : values()) {
			if (status.wireValue.equals(value)) {
				return status;
			}
		}
		throw new IllegalArgumentException("invalid status");
	}
}


