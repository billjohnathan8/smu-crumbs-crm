package com.itsa.crm.client_service.entity;

import com.itsa.crm.client_service.dto.IdentityVerificationStatus;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Unit tests for {@link ClientEntity} lifecycle hooks.
 */
class ClientEntityTest {
	@Test
	void prePersist_setsCreatedAndUpdatedAndDefaultsStatusWhenNull() {
		ClientEntity entity = new ClientEntity();
		entity.setIdentityVerificationStatus(null);

		entity.prePersist();

		assertThat(entity.getCreatedAt()).isNotNull();
		assertThat(entity.getUpdatedAt()).isNotNull();
		assertThat(entity.getUpdatedAt()).isEqualTo(entity.getCreatedAt());
		assertThat(entity.getIdentityVerificationStatus()).isEqualTo(IdentityVerificationStatus.unverified);
	}

	@Test
	void prePersist_doesNotOverrideExistingStatus() {
		ClientEntity entity = new ClientEntity();
		entity.setIdentityVerificationStatus(IdentityVerificationStatus.verified);

		entity.prePersist();

		assertThat(entity.getIdentityVerificationStatus()).isEqualTo(IdentityVerificationStatus.verified);
	}

	@Test
	void preUpdate_updatesUpdatedAt() {
		ClientEntity entity = new ClientEntity();
		entity.prePersist();
		var before = entity.getUpdatedAt();

		entity.preUpdate();

		assertThat(entity.getUpdatedAt()).isAfterOrEqualTo(before);
	}
}
