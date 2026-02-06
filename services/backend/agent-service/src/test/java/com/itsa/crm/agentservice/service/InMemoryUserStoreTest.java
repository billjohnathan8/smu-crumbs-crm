package com.itsa.crm.agentservice.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.itsa.crm.agentservice.dto.CreateUserRequest;
import com.itsa.crm.agentservice.dto.UpdateUserRequest;
import com.itsa.crm.agentservice.dto.UserDto;
import com.itsa.crm.agentservice.dto.UserRole;
import com.itsa.crm.agentservice.dto.UserStatus;
import com.itsa.crm.agentservice.exception.DuplicateUserException;
import com.itsa.crm.agentservice.exception.UserNotFoundException;
import com.itsa.crm.agentservice.security.ForbiddenException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * Unit tests for {@link InMemoryUserStore}.
 */
class InMemoryUserStoreTest {
	private TestClock clock;
	private InMemoryUserStore store;

	@BeforeEach
	void setUp() {
		clock = new TestClock(Instant.parse("2026-02-05T00:00:00Z"));
		store = new InMemoryUserStore(clock, new PasswordHasher(), "root@example.com", "RootPass!123");
	}

	@Test
	void createUser_normalizesEmailAndDefaultsRole() {
		UserDto created = store.createUser(new CreateUserRequest(
			"Alice",
			"Ng",
			"  ALICE@Example.com ",
			null,
			false,
			"temp12345"
		));

		assertEquals("usr_2", created.id());
		assertEquals("alice@example.com", created.email());
		assertEquals(UserRole.agent, created.role());
		assertEquals(UserStatus.active, created.status());

		InMemoryUserStore.UserRecord record = store.loadRecord(created.id());
		assertTrue(store.verifyPassword(record, "temp12345"));
	}

	@Test
	void createUser_duplicateEmail_throwsConflict() {
		store.createUser(new CreateUserRequest("A", "B", "ava@example.com", UserRole.agent, false, "pw"));

		assertThrows(DuplicateUserException.class, () -> store.createUser(
			new CreateUserRequest("C", "D", "AVA@example.com", UserRole.admin, false, "pw")
		));
	}

	@Test
	void updateUser_replacesEmailIndexAndRejectsDuplicate() {
		UserDto first = store.createUser(new CreateUserRequest("Ava", "Stone", "ava@example.com", UserRole.agent, false, "pw"));
		UserDto second = store.createUser(new CreateUserRequest("Ben", "Tan", "ben@example.com", UserRole.agent, false, "pw"));

		UserDto updated = store.updateUser(first.id(), new UpdateUserRequest("Ava", "Stone", "ava.new@example.com", UserRole.admin));
		assertEquals("ava.new@example.com", updated.email());
		assertNull(store.findByEmail("ava@example.com"));
		assertNotNull(store.findByEmail("ava.new@example.com"));

		assertThrows(DuplicateUserException.class, () -> store.updateUser(
			second.id(),
			new UpdateUserRequest(null, null, "ava.new@example.com", null)
		));
	}

	@Test
	void deleteUser_rootAdminIsForbidden() {
		assertThrows(ForbiddenException.class, () -> store.deleteUser("usr_1"));
	}

	@Test
	void listAndCountUsers_applyRoleFilterAndPaging() {
		store.createUser(new CreateUserRequest("A", "A", "a@example.com", UserRole.agent, false, "pw"));
		store.createUser(new CreateUserRequest("B", "B", "b@example.com", UserRole.admin, false, "pw"));
		store.createUser(new CreateUserRequest("C", "C", "c@example.com", UserRole.agent, false, "pw"));

		List<UserDto> page = store.listUsers(1, -10, "agent");
		assertEquals(1, page.size());
		assertEquals(UserRole.agent, page.get(0).role());

		assertEquals(2, store.countUsers("agent"));
		assertEquals(4, store.countUsers(null));
	}

	@Test
	void refreshTokenLifecycle_handlesRotationAndExpiry() {
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
		UserDto created = store.createUser(new CreateUserRequest("Ava", "Stone", "ava@example.com", UserRole.agent, false, "temp123"));
		String token = store.issueRefreshToken(created.id());
		assertTrue(store.isRefreshTokenValid(token));

		store.resetPassword(created.id());

		assertFalse(store.isRefreshTokenValid(token));
	}

	@Test
	void createUser_generatesPasswordWhenMissing() {
		UserDto created = store.createUser(new CreateUserRequest(
			"Alice",
			"Ng",
			"alice@example.com",
			UserRole.agent,
			false,
			null
		));

		InMemoryUserStore.UserRecord record = store.loadRecord(created.id());
		assertNotNull(record.passwordHash());
		assertFalse(record.passwordHash().isBlank());
	}

	@Test
	void updateUser_whenEmailNotProvided_keepsExistingEmailIndex() {
		UserDto created = store.createUser(new CreateUserRequest(
			"Alice",
			"Ng",
			"alice@example.com",
			UserRole.agent,
			false,
			"pw"
		));

		UserDto updated = store.updateUser(created.id(), new UpdateUserRequest(null, null, null, null));
		assertEquals("alice@example.com", updated.email());
		assertNotNull(store.findByEmail("alice@example.com"));
	}

	@Test
	void deleteUser_removesRefreshTokens() {
		UserDto created = store.createUser(new CreateUserRequest("Ava", "Stone", "ava@example.com", UserRole.agent, false, "pw"));
		String token = store.issueRefreshToken(created.id());
		assertTrue(store.isRefreshTokenValid(token));

		store.deleteUser(created.id());

		assertFalse(store.isRefreshTokenValid(token));
		assertNull(store.userIdForRefreshToken(token));
	}

	@Test
	void getUser_missingUser_throwsNotFound() {
		assertThrows(UserNotFoundException.class, () -> store.getUser("usr_999"));
		assertThrows(UserNotFoundException.class, () -> store.issueRefreshToken("usr_999"));
	}

	@Test
	void rotateRefreshToken_unknownToken_returnsNull() {
		assertNull(store.rotateRefreshToken("missing"));
		assertFalse(store.isRefreshTokenValid("missing"));
		assertNull(store.userIdForRefreshToken("missing"));
	}

	@Test
	void listUsers_blankRoleFilter_doesNotFilter() {
		store.createUser(new CreateUserRequest("A", "A", "a@example.com", UserRole.agent, false, "pw"));
		store.createUser(new CreateUserRequest("B", "B", "b@example.com", UserRole.admin, false, "pw"));

		List<UserDto> all = store.listUsers(50, 0, "  ");
		assertEquals(3, all.size());
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
