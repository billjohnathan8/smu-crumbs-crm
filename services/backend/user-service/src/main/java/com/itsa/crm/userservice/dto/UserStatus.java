package com.itsa.crm.userservice.dto;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/**
 * Lifecycle status of a user account.
 */
public enum UserStatus {
	active("active"),
	disabled("disabled");

	private final String wireValue;

	UserStatus(String wireValue) {
		this.wireValue = wireValue;
	}

	/**
	 * Returns the wire value used in JSON payloads.
	 *
	 * @return wire value
	 */
	@JsonValue
	public String wireValue() {
		return wireValue;
	}

	/**
	 * Parses a status from its wire value.
	 *
	 * @param value wire value
	 * @return matching status
	 * @throws IllegalArgumentException if the value is unknown
	 */
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
