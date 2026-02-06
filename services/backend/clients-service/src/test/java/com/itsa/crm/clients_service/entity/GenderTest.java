package com.itsa.crm.clients_service.entity;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Unit tests for {@link Gender} JSON value mapping.
 */
class GenderTest {
	@Test
	void fromApiValue_validValue_returnsEnum() {
		assertThat(Gender.fromApiValue("Female")).isEqualTo(Gender.FEMALE);
		assertThat(Gender.FEMALE.getApiValue()).isEqualTo("Female");
	}

	@Test
	void fromApiValue_unknownValue_throws() {
		assertThatThrownBy(() -> Gender.fromApiValue("Unknown"))
			.isInstanceOf(IllegalArgumentException.class)
			.hasMessageContaining("Unsupported gender");
	}
}
