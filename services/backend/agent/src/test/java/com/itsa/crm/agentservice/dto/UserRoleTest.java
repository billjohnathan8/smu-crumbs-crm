package com.itsa.crm.agentservice.dto;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import org.junit.jupiter.api.Test;

/**
 * Unit tests for {@link UserRole} serialization helpers.
 */
class UserRoleTest {
	@Test
	void fromWireValue_validValuesReturnEnum() {
		assertEquals(UserRole.admin, UserRole.fromWireValue("admin"));
		assertEquals(UserRole.agent, UserRole.fromWireValue("agent"));
		assertEquals("admin", UserRole.admin.wireValue());
	}

	@Test
	void fromWireValue_invalidValueThrows() {
		assertThrows(IllegalArgumentException.class, () -> UserRole.fromWireValue("auditor"));
	}
}
