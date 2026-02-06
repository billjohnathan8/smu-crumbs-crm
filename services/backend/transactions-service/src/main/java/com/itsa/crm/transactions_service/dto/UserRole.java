package com.itsa.crm.transactions_service.dto;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/**
 * Roles supported by the transactions-service authorization layer.
 */
public enum UserRole {
	admin("admin"),
	agent("agent");

	private final String wireValue;

	UserRole(String wireValue) {
		this.wireValue = wireValue;
	}

	@JsonValue
	public String wireValue() {
		return wireValue;
	}

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


