package com.itsa.crm.transactions_service.dto;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/**
 * Transaction types, serialized using short wire values.
 */
public enum TransactionKind {
	D("D"),
	W("W");

	private final String wireValue;

	TransactionKind(String wireValue) {
		this.wireValue = wireValue;
	}

	@JsonValue
	public String wireValue() {
		return wireValue;
	}

	@JsonCreator
	public static TransactionKind fromWireValue(String value) {
		for (TransactionKind kind : values()) {
			if (kind.wireValue.equals(value)) {
				return kind;
			}
		}
		throw new IllegalArgumentException("invalid transaction kind");
	}
}
