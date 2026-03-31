package com.scroogebank.crm.transaction_service.dto;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/**
 * Roles supported by the transaction-service authorization layer.
 */
public enum UserRole {
	admin("admin"),
	user("user"),
	service("service");

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




