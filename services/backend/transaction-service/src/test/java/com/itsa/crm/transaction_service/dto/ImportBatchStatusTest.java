package com.itsa.crm.transaction_service.dto;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import org.junit.jupiter.api.Test;

/**
 * Verifies ImportBatchStatus wire conversions.
 */
class ImportBatchStatusTest {
	@Test
	void fromWireValue_validValuesReturnEnum() {
		assertEquals(ImportBatchStatus.queued, ImportBatchStatus.fromWireValue("queued"));
		assertEquals(ImportBatchStatus.running, ImportBatchStatus.fromWireValue("running"));
		assertEquals(ImportBatchStatus.completed, ImportBatchStatus.fromWireValue("completed"));
		assertEquals(ImportBatchStatus.failed, ImportBatchStatus.fromWireValue("failed"));
		assertEquals("queued", ImportBatchStatus.queued.wireValue());
	}

	@Test
	void fromWireValue_invalidValueThrows() {
		assertThrows(IllegalArgumentException.class, () -> ImportBatchStatus.fromWireValue("unknown"));
	}
}

