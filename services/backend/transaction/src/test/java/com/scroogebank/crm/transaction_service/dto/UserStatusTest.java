package com.scroogebank.crm.transaction_service.dto;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import org.junit.jupiter.api.Test;

/**
 * Verifies UserStatus wire conversions.
 */
class UserStatusTest {
	@Test
	void fromWireValue_validValuesReturnEnum() {
		assertEquals(UserStatus.active, UserStatus.fromWireValue("active"));
		assertEquals(UserStatus.disabled, UserStatus.fromWireValue("disabled"));
		assertEquals("active", UserStatus.active.wireValue());
	}

	@Test
	void fromWireValue_invalidValueThrows() {
		assertThrows(IllegalArgumentException.class, () -> UserStatus.fromWireValue("unknown"));
	}
}

