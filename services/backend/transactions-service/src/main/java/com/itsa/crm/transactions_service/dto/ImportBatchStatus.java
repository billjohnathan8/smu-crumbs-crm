package com.itsa.crm.transactions_service.dto;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

public enum ImportBatchStatus {
	queued("queued"),
	running("running"),
	completed("completed"),
	failed("failed");

	private final String wireValue;

	ImportBatchStatus(String wireValue) {
		this.wireValue = wireValue;
	}

	@JsonValue
	public String wireValue() {
		return wireValue;
	}

	@JsonCreator
	public static ImportBatchStatus fromWireValue(String value) {
		for (ImportBatchStatus status : values()) {
			if (status.wireValue.equals(value)) {
				return status;
			}
		}
		throw new IllegalArgumentException("invalid import batch status");
	}
}

