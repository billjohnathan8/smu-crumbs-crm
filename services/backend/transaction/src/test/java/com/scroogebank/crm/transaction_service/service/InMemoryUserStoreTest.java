package com.scroogebank.crm.transaction_service.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.scroogebank.crm.transaction_service.dto.CreateUserRequest;
import com.scroogebank.crm.transaction_service.dto.UpdateUserRequest;
import com.scroogebank.crm.transaction_service.dto.UserDto;
import com.scroogebank.crm.transaction_service.dto.UserRole;
import com.scroogebank.crm.transaction_service.dto.UserStatus;
import com.scroogebank.crm.transaction_service.exception.DuplicateUserException;
import com.scroogebank.crm.transaction_service.security.ForbiddenException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * Covers user CRUD and refresh token lifecycle in the in-memory store.
 */
class InMemoryUserStoreTest {
	private TestClock clock;
	private InMemoryUserStore store;

	private void initStore() {
		clock = new TestClock(Instant.parse("2026-02-05T00:00:00Z"));
		store = new InMemoryUserStore(clock, new PasswordHasher(), "root@example.com", "RootPass!123");
	}

	@Test
	void createUser_normalizesEmailAndPersistsRole() {
		initStore();
		UserDto created = store.createUser(new CreateUserRequest(
			"Alice",
			"Ng",
			"  ALICE@Example.com ",
			UserRole.user,
			false,
			"temp12345"
		));

		assertEquals("usr_2", created.id());
		assertEquals("alice@example.com", created.email());
		assertEquals(UserRole.user, created.role());
		assertEquals(UserStatus.active, created.status());

		InMemoryUserStore.UserRecord record = store.loadRecord(created.id());
		assertTrue(store.verifyPassword(record, "temp12345"));
	}

	@Test
	void createUser_duplicateEmail_throwsConflict() {
		initStore();
		store.createUser(new CreateUserRequest("A", "B", "ava@example.com", UserRole.user, false, "pw"));

		DuplicateUserException thrown = assertThrows(DuplicateUserException.class, () -> store.createUser(
			new CreateUserRequest("C", "D", "AVA@example.com", UserRole.admin, false, "pw")
		));
		assertNotNull(thrown);
	}

	@Test
	void updateUser_replacesEmailIndexAndRejectsDuplicate() {
		initStore();
		UserDto first = store.createUser(new CreateUserRequest("Ava", "Stone", "ava@example.com", UserRole.user, false, "pw"));
		UserDto second = store.createUser(new CreateUserRequest("Ben", "Tan", "ben@example.com", UserRole.user, false, "pw"));

		UserDto updated = store.updateUser(first.id(), new UpdateUserRequest("Ava", "Stone", "ava.new@example.com", UserRole.admin));
		assertEquals("ava.new@example.com", updated.email());
		assertNull(store.findByEmail("ava@example.com"));
		assertNotNull(store.findByEmail("ava.new@example.com"));

		DuplicateUserException thrown = assertThrows(DuplicateUserException.class, () -> store.updateUser(
			second.id(),
			new UpdateUserRequest(null, null, "ava.new@example.com", null)
		));
		assertNotNull(thrown);
	}

	@Test
	void updateUser_withoutEmailChange_preservesEmailIndex() {
		initStore();
		UserDto created = store.createUser(new CreateUserRequest("Ava", "Stone", "ava@example.com", UserRole.user, false, "pw"));

		UserDto updated = store.updateUser(created.id(), new UpdateUserRequest("Ava", "Stone", null, null));

		assertEquals("ava@example.com", updated.email());
		assertNotNull(store.findByEmail("ava@example.com"));
	}

	@Test
	void deleteUser_rootAdminIsForbidden() {
		initStore();
		ForbiddenException thrown = assertThrows(ForbiddenException.class, () -> store.deleteUser("usr_1"));
		assertNotNull(thrown);
	}

	@Test
	void deleteUser_removesRefreshTokensForUser() {
		initStore();
		UserDto created = store.createUser(new CreateUserRequest("Ava", "Stone", "ava@example.com", UserRole.user, false, "pw"));
		String token = store.issueRefreshToken(created.id());
		assertTrue(store.isRefreshTokenValid(token));

		store.deleteUser(created.id());

		assertFalse(store.isRefreshTokenValid(token));
		assertNull(store.userIdForRefreshToken(token));
	}

	@Test
	void listAndCountUsers_applyRoleFilterAndPaging() {
		initStore();
		store.createUser(new CreateUserRequest("A", "A", "a@example.com", UserRole.user, false, "pw"));
		store.createUser(new CreateUserRequest("B", "B", "b@example.com", UserRole.admin, false, "pw"));
		store.createUser(new CreateUserRequest("C", "C", "c@example.com", UserRole.user, false, "pw"));

		List<UserDto> page = store.listUsers(1, -10, "user");
		assertEquals(1, page.size());
		assertEquals(UserRole.user, page.get(0).role());

		assertEquals(2, store.countUsers("user"));
		assertEquals(4, store.countUsers(null));
	}

	@Test
	void refreshTokenLifecycle_handlesRotationAndExpiry() {
		initStore();
		String token = store.issueRefreshToken("usr_1");

		assertTrue(store.isRefreshTokenValid(token));
		assertEquals("usr_1", store.userIdForRefreshToken(token));

		String rotated = store.rotateRefreshToken(token);
		assertNotNull(rotated);
		assertFalse(store.isRefreshTokenValid(token));
		assertNull(store.userIdForRefreshToken(token));

		clock.advance(Duration.ofDays(8));
		assertFalse(store.isRefreshTokenValid(rotated));
		assertNull(store.userIdForRefreshToken(rotated));
		assertNull(store.rotateRefreshToken(rotated));
	}

	@Test
	void resetPassword_invalidatesRefreshTokens() {
		initStore();
		UserDto created = store.createUser(new CreateUserRequest("Ava", "Stone", "ava@example.com", UserRole.user, false, "temp123"));
		String token = store.issueRefreshToken(created.id());
		assertTrue(store.isRefreshTokenValid(token));

		store.resetPassword(created.id());

		assertFalse(store.isRefreshTokenValid(token));
	}

	private static final class TestClock extends Clock {
		private final ZoneId zone = ZoneOffset.UTC;
		private Instant instant;

		private TestClock(Instant instant) {
			this.instant = instant;
		}

		private void advance(Duration duration) {
			instant = instant.plus(duration);
		}

		@Override
		public ZoneId getZone() {
			return zone;
		}

		@Override
		public Clock withZone(ZoneId newZone) {
			return this;
		}

		@Override
		public Instant instant() {
			return instant;
		}
	}
}

