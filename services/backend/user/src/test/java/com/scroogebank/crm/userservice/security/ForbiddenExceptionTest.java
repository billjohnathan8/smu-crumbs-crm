package com.scroogebank.crm.userservice.security;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;

import org.junit.jupiter.api.Test;

class ForbiddenExceptionTest {

	@Test
	void constructorSetsMessage() {
		ForbiddenException ex = new ForbiddenException("access denied");
		assertEquals("access denied", ex.getMessage());
	}

	@Test
	void isRuntimeException() {
		assertInstanceOf(RuntimeException.class, new ForbiddenException("test"));
	}
}
