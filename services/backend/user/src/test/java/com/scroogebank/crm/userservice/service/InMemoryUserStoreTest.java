package com.scroogebank.crm.userservice.service;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import com.scroogebank.crm.userservice.dto.CreateUserRequest;
import com.scroogebank.crm.userservice.dto.UpdateUserRequest;
import com.scroogebank.crm.userservice.dto.UserDto;
import com.scroogebank.crm.userservice.dto.UserRole;
import com.scroogebank.crm.userservice.dto.UserStatus;
import com.scroogebank.crm.userservice.exception.AccessDeniedException;
import com.scroogebank.crm.userservice.exception.DuplicateUserException;
import com.scroogebank.crm.userservice.exception.UserNotFoundException;

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
		assertEquals(UserRole.user, created.role());
		assertEquals(UserStatus.active, created.status());

		InMemoryUserStore.UserRecord record = store.loadRecord(created.id());
		assertTrue(store.verifyPassword(record, "temp12345"));
	}

	@Test
	void createUser_duplicateEmail_throwsConflict() {
		store.createUser(new CreateUserRequest("A", "B", "ava@example.com", UserRole.user, false, "pw"));

		DuplicateUserException duplicate = assertThrows(DuplicateUserException.class, () -> store.createUser(
			new CreateUserRequest("C", "D", "AVA@example.com", UserRole.admin, false, "pw")
		));
		assertNotNull(duplicate);
	}

	@Test
	void updateUser_replacesEmailIndexAndRejectsDuplicate() {
		UserDto first = store.createUser(new CreateUserRequest("Ava", "Stone", "ava@example.com", UserRole.user, false, "pw"));
		UserDto second = store.createUser(new CreateUserRequest("Ben", "Tan", "ben@example.com", UserRole.user, false, "pw"));

		UserDto updated = store.updateUser(first.id(), new UpdateUserRequest("Ava", "Stone", "ava.new@example.com", UserRole.admin));
		assertEquals("ava.new@example.com", updated.email());
		assertNull(store.findByEmail("ava@example.com"));
		assertNotNull(store.findByEmail("ava.new@example.com"));

		DuplicateUserException duplicate = assertThrows(DuplicateUserException.class, () -> store.updateUser(
			second.id(),
			new UpdateUserRequest(null, null, "ava.new@example.com", null)
		));
		assertNotNull(duplicate);
	}

	@Test
	void deleteUser_rootAdminIsForbidden() {
		AccessDeniedException denied = assertThrows(AccessDeniedException.class, () -> store.deleteUser("usr_1"));
		assertNotNull(denied);
	}

	@Test
	void updateUser_rootAdminIsForbidden() {
		AccessDeniedException denied = assertThrows(
			AccessDeniedException.class,
			() -> store.updateUser("usr_1", new UpdateUserRequest("Root", "Admin", "root@example.com", UserRole.admin))
		);
		assertNotNull(denied);
	}

	@Test
	void disableUser_rootAdminIsForbidden() {
		AccessDeniedException denied = assertThrows(AccessDeniedException.class, () -> store.disableUser("usr_1"));
		assertNotNull(denied);
	}

	@Test
	void resetPassword_rootAdminIsForbidden() {
		AccessDeniedException denied = assertThrows(AccessDeniedException.class, () -> store.resetPassword("usr_1"));
		assertNotNull(denied);
	}

	@Test
	void listAndCountUsers_applyRoleFilterAndPaging() {
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
		UserDto created = store.createUser(new CreateUserRequest("Ava", "Stone", "ava@example.com", UserRole.user, false, "temp123"));
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
			UserRole.user,
			false,
			"pw"
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
			UserRole.user,
			false,
			"pw"
		));

		UserDto updated = store.updateUser(created.id(), new UpdateUserRequest(null, null, null, null));
		assertEquals("alice@example.com", updated.email());
		assertNotNull(store.findByEmail("alice@example.com"));
	}

	@Test
	void deleteUser_removesRefreshTokens() {
		UserDto created = store.createUser(new CreateUserRequest("Ava", "Stone", "ava@example.com", UserRole.user, false, "pw"));
		String token = store.issueRefreshToken(created.id());
		assertTrue(store.isRefreshTokenValid(token));

		store.deleteUser(created.id());

		assertFalse(store.isRefreshTokenValid(token));
		assertNull(store.userIdForRefreshToken(token));
	}

	@Test
	void getUser_missingUser_throwsNotFound() {
		UserNotFoundException missingGet = assertThrows(UserNotFoundException.class, () -> store.getUser("usr_999"));
		UserNotFoundException missingToken = assertThrows(UserNotFoundException.class, () -> store.issueRefreshToken("usr_999"));
		assertNotNull(missingGet);
		assertNotNull(missingToken);
	}

	@Test
	void rotateRefreshToken_unknownToken_returnsNull() {
		assertNull(store.rotateRefreshToken("missing"));
		assertFalse(store.isRefreshTokenValid("missing"));
		assertNull(store.userIdForRefreshToken("missing"));
	}

	@Test
	void listUsers_blankRoleFilter_doesNotFilter() {
		store.createUser(new CreateUserRequest("A", "A", "a@example.com", UserRole.user, false, "pw"));
		store.createUser(new CreateUserRequest("B", "B", "b@example.com", UserRole.admin, false, "pw"));

		List<UserDto> all = store.listUsers(50, 0, "  ");
		assertEquals(3, all.size());
	}

	@Test
	void resetPasswordToken_isOneTimeAndInvalidatesRefreshTokens() {
		UserDto created = store.createUser(new CreateUserRequest("Ava", "Stone", "ava@example.com", UserRole.user, false, "TempPass!123"));
		String refresh = store.issueRefreshToken(created.id());
		String token = store.createPasswordResetToken("ava@example.com");

		assertNotNull(token);
		store.resetPasswordWithToken(token, "NewPass!123");
		assertFalse(store.isRefreshTokenValid(refresh));
		assertTrue(store.verifyPassword(store.loadRecord(created.id()), "NewPass!123"));
		assertThrows(IllegalArgumentException.class, () -> store.resetPasswordWithToken(token, "OtherPass!123"));
	}

	@Test
	void resetPasswordToken_reissuingInvalidatesPriorToken() {
		store.createUser(new CreateUserRequest("Ava", "Stone", "ava@example.com", UserRole.user, false, "TempPass!123"));
		String first = store.createPasswordResetToken("ava@example.com");
		String second = store.createPasswordResetToken("ava@example.com");

		assertNotNull(first);
		assertNotNull(second);
		assertThrows(IllegalArgumentException.class, () -> store.resetPasswordWithToken(first, "OtherPass!123"));
	}

	@Test
	void latestResetToken_disabledByDefault() {
		store.createUser(new CreateUserRequest("Ava", "Stone", "ava@example.com", UserRole.user, false, "TempPass!123"));
		store.createPasswordResetToken("ava@example.com");

		assertNull(store.getLatestResetToken("ava@example.com"));
	}

	@Test
	void latestResetToken_availableWhenTestIntrospectionEnabled() {
		InMemoryUserStore testStore = new InMemoryUserStore(clock, new PasswordHasher(), "root@example.com", "RootPass!123", true);
		testStore.createUser(new CreateUserRequest("Ava", "Stone", "ava@example.com", UserRole.user, false, "TempPass!123"));

		String token = testStore.createPasswordResetToken("ava@example.com");
		assertEquals(token, testStore.getLatestResetToken("ava@example.com"));
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
