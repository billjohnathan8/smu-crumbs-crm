package com.itsa.crm.transactions_service.dto;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

public enum TransactionStatus {
	Completed("Completed"),
	Pending("Pending"),
	Failed("Failed");

	private final String wireValue;

	TransactionStatus(String wireValue) {
		this.wireValue = wireValue;
	}

	@JsonValue
	public String wireValue() {
		return wireValue;
	}

	@JsonCreator
	public static TransactionStatus fromWireValue(String value) {
		for (TransactionStatus status : values()) {
			if (status.wireValue.equals(value)) {
				return status;
			}
		}
		throw new IllegalArgumentException("invalid transaction status");
	}
}

