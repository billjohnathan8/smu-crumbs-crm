package com.itsa.crm.client_service.util;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Unit tests for {@link IdCodec}.
 */
class IdCodecTest {
	@Test
	void encode_prefixesId() {
		assertThat(IdCodec.encode("clt_", 42)).isEqualTo("clt_42");
	}

	@Test
	void decode_validValue_returnsId() {
		assertThat(IdCodec.decode("clt_", "clt_7")).isEqualTo(7L);
	}

	@Test
	void decode_nullOrWrongPrefix_throws() {
		assertThatThrownBy(() -> IdCodec.decode("clt_", null))
			.isInstanceOf(IllegalArgumentException.class)
			.hasMessageContaining("invalid id");
		assertThatThrownBy(() -> IdCodec.decode("clt_", "acc_7"))
			.isInstanceOf(IllegalArgumentException.class)
			.hasMessageContaining("invalid id");
	}
}
