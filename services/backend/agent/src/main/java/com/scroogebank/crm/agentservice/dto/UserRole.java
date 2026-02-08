package com.scroogebank.crm.agentservice.dto;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/**
 * Supported roles for users within the service.
 */
public enum UserRole {
	admin("admin"),
	agent("agent");

	private final String wireValue;

	UserRole(String wireValue) {
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
	 * Parses a role from its wire value.
	 *
	 * @param value wire value
	 * @return matching role
	 * @throws IllegalArgumentException if the value is unknown
	 */
	@JsonCreator
	public static UserRole fromWireValue(String value) {
		for (UserRole role : values()) {
			if (role.wireValue.equals(value)) {
				return role;
			}
		}
		throw new IllegalArgumentException("invalid role");
	}
}
